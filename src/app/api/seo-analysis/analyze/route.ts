/**
 * POST /api/seo-analysis/analyze { runId } — 保存済みの事実シートを Claude に分析させる。
 * 1 回の収集につき MAX_ANALYSES_PER_RUN 回までやり直せる（回数制限は消費しない）。
 *
 * 応答は NDJSON（2026-09-19）:
 *   { type: "progress", elapsedMs, outputChars, attempt }  … 2 秒ごと + 出力が進むたび
 *   { type: "result", analysis, analysisCount }
 *   { type: "error", error, code? }
 * 1〜3 分かかる生成のあいだ何も流さないと、経路の途中で切られたり画面が止まって見えるため。
 * Vercel の上限（300 秒）より手前の DEADLINE_MS で自分から打ち切り、エラーとして返す。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbErrorResponse, DbError } from "@/lib/db/supabase";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { generateAnalysis } from "@/lib/seo-analysis/ai/analyze";
import { getRun, MAX_ANALYSES_PER_RUN, saveAnalysis } from "@/lib/seo-analysis/runs";
import { requireUser } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 自分から打ち切る時間（Vercel の 300 秒より手前） */
export const DEADLINE_MS = 270_000;
const HEARTBEAT_MS = 2_000;

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Accel-Buffering": "no",
};

const BodySchema = z.object({ runId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const userId = await requireUser({ feature: "seo-analysis" });
  if (userId instanceof Response) return userId;
  if (!isAnthropicEnabled()) return Response.json({ error: "ANTHROPIC_API_KEY が未設定です" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "runId が不正です" }, { status: 400 });

  let run;
  try {
    run = await getRun(userId, parsed.data.runId);
  } catch (err) {
    return dbErrorResponse(err);
  }
  if (!run) return Response.json({ error: "分析が見つかりません" }, { status: 404 });
  if (run.analysisCount >= MAX_ANALYSES_PER_RUN) {
    return Response.json({ error: `この収集結果に対する AI 分析は ${MAX_ANALYSES_PER_RUN} 回までです。新しく収集してください`, code: "limit" }, { status: 429 });
  }
  const sheet = run.sheet;
  const runId = run.id;
  const nextCount = run.analysisCount + 1;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          closed = true;
        }
      };
      const started = Date.now();
      let outputChars = 0;
      let attempt = 1;
      const progress = () => send({ type: "progress", elapsedMs: Date.now() - started, outputChars, attempt });
      const heartbeat = setInterval(progress, HEARTBEAT_MS);
      // 生成は画面が閉じても最後まで続けて保存する（request.signal には結ばない）。時間だけで打ち切る
      const deadline = new AbortController();
      const deadlineTimer = setTimeout(() => deadline.abort(), DEADLINE_MS);
      progress();
      try {
        const record = await generateAnalysis(sheet, {
          signal: deadline.signal,
          onProgress: (p) => {
            outputChars = p.outputChars;
            attempt = p.attempt;
            progress();
          },
        });
        await saveAnalysis(userId, runId, record, nextCount);
        send({ type: "result", analysis: record, analysisCount: nextCount });
      } catch (err) {
        if (deadline.signal.aborted) {
          send({ type: "error", error: `AI 分析が ${Math.round(DEADLINE_MS / 60_000)} 分以内に終わりませんでした。「AI 分析をやり直す」を押してください`, code: "timeout" });
        } else if (err instanceof DbError) {
          send({ type: "error", error: err.message, code: err.code });
        } else {
          const { message } = toApiError(err);
          send({ type: "error", error: message });
        }
      } finally {
        clearInterval(heartbeat);
        clearTimeout(deadlineTimer);
        closed = true;
        try {
          controller.close();
        } catch {
          /* 既に閉じている */
        }
      }
    },
  });
  return new Response(stream, { headers: NDJSON_HEADERS });
}
