/**
 * POST /api/writing/rewrite — エディター（D3）のリライト。
 *
 * NDJSON で { type: "delta", text } / { type: "done" } / { type: "error", error } を流す。
 * 選択範囲があるときは選択部分だけを書き換えて返す（差分表示はクライアント側）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { MAX_REWRITE_CHARS } from "@/lib/writing/prompt";
import { streamRewrite } from "@/lib/writing/rewrite";
import type { RewriteStreamEvent } from "@/lib/writing/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  "X-Accel-Buffering": "no",
} as const;

const BodySchema = z.object({
  target: z.string().min(1).max(MAX_REWRITE_CHARS),
  instruction: z.string().min(1).max(1_000),
  selection: z.boolean().optional(),
  context: z
    .object({ before: z.string().max(4_000).optional(), after: z.string().max(4_000).optional() })
    .optional(),
  keyword: z.string().max(200).optional(),
  relatedWords: z.array(z.string().max(60)).max(50).optional(),
  tone: z.enum(["desu", "dearu"]).optional(),
});

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "リライトには ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください" },
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
    return Response.json(
      { error: `書き換える本文（${MAX_REWRITE_CHARS} 文字以内）と指示を送信してください` },
      { status: 422 },
    );
  }

  const encoder = new TextEncoder();
  const input = { ...parsed.data, signal: request.signal };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: RewriteStreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        for await (const event of streamRewrite(input)) write(event);
      } catch (err) {
        if (request.signal.aborted) {
          // クライアントが中止した
        } else {
          console.error("[writing/rewrite] stream error", err);
          write({ type: "error", error: toApiError(err).message });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
