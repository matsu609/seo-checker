/**
 * POST /api/seo-analysis/collect — 精密分析の「収集」。
 *
 * クロール → クイック診断 → PSI / CrUX / SerpApi / Google 連携 → 事実シート → 保存。
 * 進捗を NDJSON で流し、最後に run と sheet を返す。AI 分析は /analyze（別リクエスト）。
 * 月の回数はここで消費する（クロールと SerpApi の実費が出るため）。
 */
import { NextRequest } from "next/server";
import { FetchError } from "@/lib/analyzer/fetch";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, DbError, isSupabaseConfigured } from "@/lib/db/supabase";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { collectFactSheet } from "@/lib/seo-analysis/collect";
import { acquireCrawlSlot, clientKeyOf } from "@/lib/seo-analysis/gate";
import { AnalysisInputSchema, normalizeInput } from "@/lib/seo-analysis/input";
import { quotaExceeded, quotaFor } from "@/lib/seo-analysis/quota";
import { createRun } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";
export const maxDuration = 300;

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Accel-Buffering": "no",
};

export async function POST(request: NextRequest) {
  const denied = await requireAuth({ feature: "seo-analysis" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "精密分析には SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
  }
  if (!isAnthropicEnabled()) {
    return Response.json({ error: "精密分析には ANTHROPIC_API_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
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
      { error: `今月の分析回数（${quota.limit} 回）を使い切りました。来月に再度お試しください`, code: "limit", quota },
      { status: 429 },
    );
  }

  const release = acquireCrawlSlot(clientKeyOf(request.headers));
  if (!release) {
    return Response.json({ error: "他の診断が実行中です。しばらく待ってからもう一度お試しください", code: "busy" }, { status: 429 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
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
        try {
          controller.close();
        } catch {
          /* 既に閉じている */
        }
      }
    },
    cancel() {
      release();
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}
