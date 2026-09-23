/**
 * GET /api/geo/dashboard — ダッシュボードの数値（仕様書 §10）。
 *
 * 保存済みの観測から、**4 週ローリング**のブランドシェアと指名検索の主指標、
 * クレジットの残高と内訳、モデル更新のマーカーを返す。
 * 集計は純関数（lib/geo/aggregate.ts）なので、ここは組み立てるだけ。
 */
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import {
  answerObservations,
  applyFilter,
  brandedMetrics,
  byModel,
  domainCitations,
  keywordAiObservations,
  keywordOutcomes,
  promptObservations,
  recentWeekStarts,
  ROLLING_DAYS,
  shares,
  targetShares,
  weeklySeries,
  type AggregateInput,
  type ObservationFilter,
  type TargetShare,
} from "@/lib/geo/aggregate";
import { balanceAfterReset, forecastStandardPlan, nextResetAt } from "@/lib/geo/credits";
import {
  ensureAccount,
  listBrands,
  listKeywordOutcomes,
  listKeywords,
  listLedger,
  listModelVersionEvents,
  listObservations,
  listPrompts,
  listRecentOutputs,
} from "@/lib/geo/store";
import { GEO_MODELS, type DomainClass, type GeoModel } from "@/lib/geo/types";
import { nextCronRun } from "@/lib/geo/schedule";
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { monthStartJst } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";

/** 折れ線グラフで見せる週数。8 週 = 2 か月弱（4 週ローリングの見出しの倍） */
const TREND_WEEKS = 8;

export async function GET(request: NextRequest) {
  const userId = await requireUser({ feature: "geo" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase が未設定です", code: "not_configured" }, { status: 503 });

  try {
    const now = new Date();
    // 画面上部のフィルタ行（2026-09-22）。不正な値は既定に落とす
    const params = request.nextUrl.searchParams;
    const rawModel = params.get("model");
    const rawDays = Number(params.get("days"));
    const filter: ObservationFilter = {
      model: rawModel && (GEO_MODELS as readonly string[]).includes(rawModel) ? (rawModel as GeoModel) : "all",
      tag: params.get("tag") ?? "all",
      days: Number.isFinite(rawDays) && rawDays > 0 && rawDays <= 90 ? Math.trunc(rawDays) : ROLLING_DAYS,
    };

    const [account, brands, prompts, keywords, rows, versions] = await Promise.all([
      ensureAccount(userId, now),
      listBrands(userId),
      listPrompts(userId),
      listKeywords(userId),
      listObservations(userId, 90),
      listModelVersionEvents(20),
    ]);
    const ledger = await listLedger(userId, monthStartJst(now));

    const promptById = new Map(prompts.map((p) => [p.id, p]));
    const observations: AggregateInput[] = rows.map((r) => {
      const prompt = r.promptId ? promptById.get(r.promptId) : undefined;
      return {
        brandId: r.brandId,
        promptId: r.promptId,
        keywordId: r.keywordId,
        tags: prompt?.tags ?? [],
        isBranded: prompt?.isBranded ?? false,
        model: r.model as GeoModel,
        kind: r.kind,
        executedAt: r.executedAt,
        mentioned: r.mentioned,
        cited: r.cited,
        domainClasses: r.domainClass ? [r.domainClass as DomainClass] : [],
        citedDomains: r.citedDomains,
      };
    });

    const own = brands.find((b) => b.type === "own") ?? null;
    // フィルタを当ててから集計する（期間 → モデル → タグ）
    const filtered = applyFilter(observations, filter, now);
    // 母集団を分けて数える（2026-09-23）。以前はプロンプトの回答と、キーワード側の観測
    // （本文の無い順位計測を含む）が同じ分母に入っていた:
    //   ブランドシェア     … 登録したプロンプトへの LLM の回答だけ（仕様書 §3.3）
    //   モデル別シェア     … 上に加えて、キーワードの AI Overviews / AI モードの回答（モデルごとなので混ざらない）
    //   キーワードの引用率 … AI Overviews / AI モードだけ（順位計測も model = "aio" なので入れると n が倍になる）
    const answers = answerObservations(filtered);
    const overall = shares(promptObservations(filtered));
    const perModel: Record<string, ReturnType<typeof shares>> = {};
    for (const [model, modelRows] of byModel(answers)) perModel[model] = shares(modelRows);

    // 計測対象ごとの出現率（棒グラフ）。自社ブランドが無いうちは空で返す
    const withLabel = (shares: TargetShare[], labels: Map<string, string>) =>
      shares.filter((s) => labels.has(s.targetId)).map((s) => ({ ...s, label: labels.get(s.targetId) ?? s.targetId }));
    const promptLabels = new Map(prompts.map((p) => [p.id, p.text]));
    const keywordLabels = new Map(keywords.map((k) => [k.id, k.text]));
    const perPrompt = own ? withLabel(targetShares(promptObservations(filtered), { brandId: own.id, axis: "prompt", metric: "mention" }), promptLabels) : [];
    const perKeyword = own ? withLabel(targetShares(keywordAiObservations(filtered), { brandId: own.id, axis: "keyword", metric: "citation" }), keywordLabels) : [];

    // 週ごとの推移（折れ線グラフ。利用者の指示 2026-09-21）
    const weeks = TREND_WEEKS;
    // 推移は「期間」ではなく常に 8 週ぶん見せる（傾きを読む図なので短く切らない）。
    // モデル・タグの絞り込みだけを効かせる
    const trendRows = applyFilter(observations, { ...filter, days: 90 }, now);
    const trends = {
      weeks: recentWeekStarts(weeks, now),
      prompt: own ? weeklySeries(promptObservations(trendRows), { brandId: own.id, axis: "prompt", metric: "mention", labels: promptLabels, weeks }, now) : [],
      keyword: own ? weeklySeries(keywordAiObservations(trendRows), { brandId: own.id, axis: "keyword", metric: "citation", labels: keywordLabels, weeks }, now) : [],
    };

    // ドメイン別の引用（自分の観測範囲の実測。順位計測の行は AI Overviews と重なるので入れない）
    const ownDomains = brands.filter((b) => b.type === "own").flatMap((b) => b.domains);
    const competitorDomains = brands.filter((b) => b.type === "competitor").flatMap((b) => b.domains);
    const domains = domainCitations(answers, { own: ownDomains, competitors: competitorDomains });

    // 最近の生成結果（実際の LLM 出力）と、定期実行の予定
    const recent = own ? await listRecentOutputs(userId, 8, own.id) : [];

    // キーワードごとの成果（SEO 順位 × AI の出現 × 引用）。順位は自社のドメインで引く（2026-09-23）
    const outcomes = own
      ? keywordOutcomes(await listKeywordOutcomes(userId, own.id, filter.days ?? ROLLING_DAYS, ownDomains), keywordLabels)
      : { rows: [], appearedCount: 0, citedCount: 0, citedRate: null, opportunities: [] };
    const lastRun = observations.reduce<string | null>((acc, o) => (acc === null || o.executedAt > acc ? o.executedAt : acc), null);
    const schedule = { nextRunAt: nextCronRun(now).toISOString(), lastRunAt: lastRun, enabled: true };

    // クレジットの消費内訳（今月）
    const spentByAction: Record<string, number> = {};
    for (const entry of ledger) spentByAction[entry.action] = Math.round(((spentByAction[entry.action] ?? 0) + entry.credits) * 100) / 100;
    const spent = Math.round(Object.values(spentByAction).reduce((a, b) => a + b, 0) * 100) / 100;

    // 月が変わってまだ定期実行が走っていないときも、リセット後の残高と次のリセット日を見せる
    // （保存は定期実行・今すぐ実行が行う。2026-09-23）
    const reset = balanceAfterReset(account, now);
    const balance = reset.balance;
    const shownAccount = reset.reset ? { ...account, creditBalance: balance, creditResetAt: nextResetAt(now) } : account;

    return Response.json(
      {
        account: shownAccount,
        brands,
        promptCount: prompts.length,
        precisionCount: prompts.filter((p) => p.precisionMode).length,
        overall,
        perModel,
        perPrompt,
        perKeyword,
        trends,
        domains,
        recent,
        outcomes,
        schedule,
        filter,
        tags: [...new Set(prompts.flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, "ja")),
        keywordCount: keywords.length,
        branded: own ? brandedMetrics(observations, own.id) : null,
        versions,
        credits: { balance, spent, byAction: spentByAction, forecast: forecastStandardPlan() },
        needsReview: rows.filter((r) => r.mentioned && r.confidence < 0.7).length,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return dbErrorResponse(err);
  }
}

