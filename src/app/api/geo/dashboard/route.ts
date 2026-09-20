/**
 * GET /api/geo/dashboard — ダッシュボードの数値（仕様書 §10）。
 *
 * 保存済みの観測から、**4 週ローリング**のブランドシェアと指名検索の主指標、
 * クレジットの残高と内訳、モデル更新のマーカーを返す。
 * 集計は純関数（lib/geo/aggregate.ts）なので、ここは組み立てるだけ。
 */
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { brandedMetrics, byModel, rollingShares, rollingTargetShares, type AggregateInput, type TargetShare } from "@/lib/geo/aggregate";
import { forecastStandardPlan } from "@/lib/geo/credits";
import { ensureAccount, listBrands, listKeywords, listLedger, listModelVersionEvents, listObservations, listPrompts } from "@/lib/geo/store";
import type { DomainClass, GeoModel } from "@/lib/geo/types";
import { requireUser } from "@/lib/auth/guard";
import { monthStartJst } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUser({ feature: "geo" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase が未設定です", code: "not_configured" }, { status: 503 });

  try {
    const now = new Date();
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
        executedAt: r.executedAt,
        mentioned: r.mentioned,
        cited: r.cited,
        domainClasses: r.domainClass ? [r.domainClass as DomainClass] : [],
      };
    });

    const own = brands.find((b) => b.type === "own") ?? null;
    const overall = rollingShares(observations, now);
    const perModel: Record<string, ReturnType<typeof rollingShares>> = {};
    for (const [model, modelRows] of byModel(observations)) perModel[model] = rollingShares(modelRows, now);

    // 計測対象ごとの出現率（棒グラフ）。自社ブランドが無いうちは空で返す
    const withLabel = (shares: TargetShare[], labels: Map<string, string>) =>
      shares.filter((s) => labels.has(s.targetId)).map((s) => ({ ...s, label: labels.get(s.targetId) ?? s.targetId }));
    const promptLabels = new Map(prompts.map((p) => [p.id, p.text]));
    const keywordLabels = new Map(keywords.map((k) => [k.id, k.text]));
    const perPrompt = own ? withLabel(rollingTargetShares(observations, { brandId: own.id, axis: "prompt", metric: "mention" }, now), promptLabels) : [];
    const perKeyword = own ? withLabel(rollingTargetShares(observations, { brandId: own.id, axis: "keyword", metric: "citation" }, now), keywordLabels) : [];

    // クレジットの消費内訳（今月）
    const spentByAction: Record<string, number> = {};
    for (const entry of ledger) spentByAction[entry.action] = Math.round(((spentByAction[entry.action] ?? 0) + entry.credits) * 100) / 100;
    const spent = Math.round(Object.values(spentByAction).reduce((a, b) => a + b, 0) * 100) / 100;

    return Response.json(
      {
        account,
        brands,
        promptCount: prompts.length,
        precisionCount: prompts.filter((p) => p.precisionMode).length,
        overall,
        perModel,
        perPrompt,
        perKeyword,
        keywordCount: keywords.length,
        branded: own ? brandedMetrics(observations, own.id) : null,
        versions,
        credits: { balance: account.creditBalance, spent, byAction: spentByAction, forecast: forecastStandardPlan() },
        needsReview: rows.filter((r) => r.mentioned && r.confidence < 0.7).length,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return dbErrorResponse(err);
  }
}

