/**
 * POST /api/seo-analysis/collect — 精密診断の「収集」。
 *
 * クロール → クイック診断 → PSI / CrUX / SerpApi / Google 連携 → 事実シート → 保存。
 * 進捗を NDJSON で流し、最後に run と sheet を返す。AI 分析は /analyze（別リクエスト）。
 * 月の回数はここで消費する（クロールと SerpApi の実費が出るため）。
 */
import { NextRequest } from "next/server";
import { FetchError } from "@/lib/analyzer/fetch";
import { dbErrorResponse, DbError, isSupabaseConfigured } from "@/lib/db/supabase";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { collectFactSheet } from "@/lib/seo-analysis/collect";
import { acquireCrawlSlot, crawlClientKey } from "@/lib/crawl/gate";
import { ndjsonResponse } from "@/lib/crawl/stream";
import { AnalysisInputSchema, normalizeInput } from "@/lib/seo-analysis/input";
import { quotaExceeded, quotaFor } from "@/lib/seo-analysis/quota";
import { createRun } from "@/lib/seo-analysis/runs";
import { requireUser } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const userId = await requireUser({ feature: "seo-analysis" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "精密診断には SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
  }
  if (!isAnthropicEnabled()) {
    return Response.json({ error: "精密診断には ANTHROPIC_API_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = AnalysisInputSchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  }
  const input = normalizeInput(parsed.data);

  let quota;
  try {
    quota = await quotaFor(userId);
  } catch (err) {
    return dbErrorResponse(err);
  }
  if (quotaExceeded(quota)) {
    return Response.json(
      { error: `今月の精密診断（${quota.limit} 回。毎月の自動再診断を含む）を使い切りました。翌月 1 日に戻ります`, code: "limit", quota },
      { status: 429 },
    );
  }

  // サイト診断（/api/site-audit）と同じ "audit" の枠を合計で数える（crawl/gate.ts）
  const release = acquireCrawlSlot("audit", crawlClientKey(request.headers));
  if (!release) {
    return Response.json({ error: "他の診断が実行中です。しばらく待ってからもう一度お試しください", code: "busy" }, { status: 429 });
  }

  // 共通の NDJSON 応答（nosniff 付き・切断後は書かない。crawl/stream.ts）。
  // 2026-09-23: 以前は切断後の enqueue が例外になり、保存の直後の result 行で落ちていた
  return ndjsonResponse<unknown>(
    async (sink) => {
      const send = (obj: unknown) => sink.send(obj);
      try {
        const { sheet, audit } = await collectFactSheet(input, {
          signal: request.signal,
          onProgress: (p) => send({ type: "progress", ...p }),
        });
        send({ type: "progress", step: "sheet", message: "保存しています" });
        const run = await createRun({ userId, input, origin: sheet.site.origin, sheet, audit });
        send({ type: "result", run, sheet, audit });
      } catch (err) {
        if (request.signal.aborted) return;
        if (err instanceof FetchError) send({ type: "error", error: err.message, code: err.code });
        else if (err instanceof DbError) send({ type: "error", error: err.message, code: err.code });
        else {
          console.error("[seo-analysis] collect failed", err);
          send({ type: "error", error: err instanceof Error ? err.message : "収集に失敗しました" });
        }
      } finally {
        release();
      }
    },
    { onCancel: release },
  );
}
