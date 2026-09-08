/**
 * POST /api/page-diagnosis/chat — 診断結果を文脈にした AI チャット（実装ガイド §9.4）。
 *
 * NDJSON（1 行 1 JSON）で流す:
 *   { type: "delta", text }  … 本文の断片
 *   { type: "done" }         … 正常終了
 *   { type: "error", error } … 途中で失敗（ストリーム開始後はステータスを変えられない）
 *
 * 入力の検証と連携チェックはストリームを始める前に済ませ、そこまでは JSON で返す。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { streamChat } from "@/lib/page-diagnosis/chat";
import { DiagnosisResultSchema } from "@/lib/page-diagnosis/store";
import type { ChatStreamEvent, DiagnosisResult } from "@/lib/page-diagnosis/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  "X-Accel-Buffering": "no",
} as const;

const BodySchema = z.object({
  /** 診断結果（ブラウザのストアに保存してあるもの） */
  result: DiagnosisResultSchema,
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4_000) }))
    .min(1)
    .max(40),
});

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "AI チャットには ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "診断結果と質問を送信してください" }, { status: 422 });
  }

  const encoder = new TextEncoder();
  // zod スキーマは types.ts と同じ形。features / relatedQuestions は文字列の緩い型なので明示的に渡す
  const result = parsed.data.result as unknown as DiagnosisResult;
  const messages = parsed.data.messages;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: ChatStreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        for await (const event of streamChat({ result, messages, signal: request.signal })) {
          write(event);
        }
      } catch (err) {
        if (request.signal.aborted) {
          // クライアントが中止した。何も書かずに閉じる
        } else {
          console.error("[page-diagnosis/chat] stream error", err);
          write({ type: "error", error: toApiError(err).message });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
