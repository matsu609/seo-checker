/**
 * POST /api/search-console/analysis
 * 選んだサイトの Search Console の実測を AI に読ませ、現状分析とネクストアクション（合計 400 文字程度）を作る。
 *
 * **月に 1 回**（利用者の指示 2026-09-24）。毎月 1 日（日本時間）に 1 回分が付き、持ち越さない。
 * 判定は Clerk の privateMetadata に保存した前回の分析の日時で行う（Supabase が無くても効く）。
 * 運用者（ADMIN_EMAILS）は回数を数えない。AI の呼び出しが失敗したときは回数を消費しない。
 */
import { z } from "zod";
import { isAdmin } from "@/lib/admin/guard";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { GoogleLinkError, googleErrorResponse } from "@/lib/google/errors";
import { formatJpDate, nextAvailableOn, usedThisMonth, type AnalysisRecord } from "@/lib/google/search-console/analysis";
import { analyzeSearchPerformance } from "@/lib/google/search-console/analyze";
import { SEARCH_CONSOLE_PERIODS } from "@/lib/google/search-console/period";
import { loadSearchPerformance } from "@/lib/google/search-console/performance";
import { getSearchConsoleSettings, setLastAnalysis } from "@/lib/google/search-console/settings";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { recordUsage } from "@/lib/usage/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const NO_STORE = { "cache-control": "no-store" } as const;

const BodySchema = z.object({
  days: z
    .number()
    .int()
    .refine((d) => (SEARCH_CONSOLE_PERIODS as readonly number[]).includes(d), { message: `期間は ${SEARCH_CONSOLE_PERIODS.join(" / ")} 日のいずれかで指定してください` })
    .optional(),
});

export async function POST(request: Request) {
  const denied = await requireAuth({ feature: "search-console" });
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json({ error: "AI 機能は無効です。サーバーに ANTHROPIC_API_KEY を設定してください" }, { status: 503, headers: NO_STORE });
  }

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    // 本文なしは既定（28 日）
  }
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  const days = parsed.data.days ?? 28;

  const userId = (await currentUserId()) ?? "anonymous";
  const [settings, staff] = await Promise.all([getSearchConsoleSettings(), isAdmin()]);
  const siteUrl = settings.searchConsoleSiteUrl;
  if (!siteUrl) {
    return googleErrorResponse(new GoogleLinkError("見る対象の Search Console のサイトが選ばれていません。この画面の「対象サイト」で選んでください。", "not_selected"));
  }
  const now = new Date();
  if (!staff && usedThisMonth(settings.lastAnalysis ?? null, now)) {
    const resetsOn = nextAvailableOn(now);
    return Response.json(
      { error: `AI の分析は月に 1 回までです。今月はもう使いました。次は ${formatJpDate(resetsOn)}から使えます。`, code: "usage_limit", resetsOn },
      { status: 429, headers: NO_STORE },
    );
  }

  let data;
  try {
    data = await loadSearchPerformance({ userId, siteUrl, days });
  } catch (err) {
    return googleErrorResponse(err);
  }
  if (data.totals.impressions === 0) {
    return Response.json({ error: "この期間の表示回数が 0 のため、分析できる数字がありません（回数は消費していません）。" }, { status: 422, headers: NO_STORE });
  }

  try {
    const { output, model } = await analyzeSearchPerformance(data);
    const record: AnalysisRecord = { createdAt: now.toISOString(), siteUrl, range: data.range, summary: output.summary, actions: output.actions };
    await setLastAnalysis(record);
    // 設定画面の「今月の利用回数」に出すための記録。失敗しても分析は返す（回数の判定は上の Clerk 側）
    if (isSupabaseConfigured()) {
      await recordUsage(userId, "gsc-analysis", 1, { model, days }).catch((err) => console.warn("[gsc-analysis] usage record failed", err instanceof Error ? err.message : err));
    }
    return Response.json({ analysis: record, nextAvailableOn: staff ? null : nextAvailableOn(now) }, { headers: NO_STORE });
  } catch (err) {
    const info = toApiError(err);
    return Response.json({ error: `${info.message}（回数は消費していません）` }, { status: info.status, headers: NO_STORE });
  }
}
