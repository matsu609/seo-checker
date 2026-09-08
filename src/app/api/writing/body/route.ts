/**
 * POST /api/writing/body — 構成案から本文を見出しごとに生成する（D1）。
 *
 * NDJSON（1 行 1 JSON）で流す:
 *   { type: "section-start", index, total, h2 }
 *   { type: "delta", index, text }
 *   { type: "section-end", index, markdown }
 *   { type: "done", sections, chars }
 *   { type: "error", error }
 *
 * 入力の検証と連携チェックはストリームを始める前に済ませる
 * （開始後はステータスもヘッダーも変えられない）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { streamBody } from "@/lib/writing/body";
import { MAX_SECTIONS } from "@/lib/writing/outline";
import type { ArticleOutline, BodyStreamEvent } from "@/lib/writing/types";

export const runtime = "nodejs";
// 見出しの数だけ生成するため長くなる
export const maxDuration = 300;

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  "X-Accel-Buffering": "no",
} as const;

/**
 * リクエスト用の構成案スキーマ。
 *
 * localStorage 用の StoredOutlineSchema は長さ制限を持たないので、そのまま
 * リクエストの検証に使わない。ここに来る値はすべてプロンプトへ埋め込まれるため、
 * 上限が無いと 1 リクエストで巨大な入力を送り込めてしまう。
 */
const MAX_SUBSECTIONS = 12;
const MAX_TOPICS = 30;

const RequestOutlineSectionSchema = z.object({
  h2: z.string().max(200),
  h3: z.array(z.string().max(200)).max(MAX_SUBSECTIONS),
  goal: z.string().max(500),
  target_chars: z.number().int().min(0).max(20_000),
});

const RequestOutlineSchema = z.object({
  search_intent: z.string().max(1_000),
  audience: z.string().max(1_000),
  common_topics: z.array(z.string().max(200)).max(MAX_TOPICS),
  missing_topics: z.array(z.string().max(200)).max(MAX_TOPICS),
  title_suggestions: z.array(z.string().max(300)).max(10),
  description_suggestions: z.array(z.string().max(500)).max(10),
  outline: z.array(RequestOutlineSectionSchema).max(MAX_SECTIONS),
});

const BodySchema = z.object({
  keyword: z.string().min(1).max(200),
  outline: RequestOutlineSchema,
  tone: z.enum(["desu", "dearu"]).optional(),
});

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "本文の生成には ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください" },
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
    return Response.json({ error: "対策キーワードと構成案を送信してください" }, { status: 422 });
  }
  const outline = parsed.data.outline as ArticleOutline;
  const sections = outline.outline.filter((s) => s.h2.trim().length > 0);
  if (sections.length === 0) {
    return Response.json({ error: "構成案に見出しがありません。先に構成案を作成してください" }, { status: 422 });
  }
  if (sections.length > MAX_SECTIONS) {
    return Response.json({ error: `見出しは ${MAX_SECTIONS} 個までです。構成案を減らしてから実行してください` }, { status: 422 });
  }

  const encoder = new TextEncoder();
  const input = {
    keyword: parsed.data.keyword.trim(),
    outline,
    tone: parsed.data.tone ?? ("desu" as const),
    signal: request.signal,
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: BodyStreamEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };
      try {
        for await (const event of streamBody(input)) write(event);
      } catch (err) {
        if (request.signal.aborted) {
          // クライアントが中止した。何も書かずに閉じる
        } else {
          console.error("[writing/body] stream error", err);
          write({ type: "error", error: toApiError(err).message });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
