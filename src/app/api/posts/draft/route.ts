/**
 * POST /api/posts/draft … ビジネス プロフィールへの投稿の下書きを AI が作る
 * （ログイン必須、ANTHROPIC_API_KEY が要る）。
 *
 * 本文: { storeName, category?, topic, description?, reviews? } → { draft }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { LOCAL_POST_SUMMARY_MAX, TOPIC_MAX } from "@/lib/posts/constants";
import { generatePostDraft } from "@/lib/posts/draft";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  storeName: z.string().trim().min(1, "店名がありません").max(200),
  category: z.string().trim().max(60).default(""),
  topic: z.string().trim().max(TOPIC_MAX).default(""),
  description: z.string().trim().max(LOCAL_POST_SUMMARY_MAX).default(""),
  reviews: z.array(z.string().max(2_000)).max(3).default([]),
});

export interface PostsDraftResponse {
  draft: string;
}

export async function POST(request: Request) {
  const denied = await requireAuth({ feature: "posts" });
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json({ error: "AI の下書きには ANTHROPIC_API_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  const d = parsed.data;
  try {
    const draft = await generatePostDraft(
      { storeName: d.storeName, category: d.category, topic: d.topic, description: d.description, reviews: d.reviews },
      { signal: request.signal },
    );
    const body: PostsDraftResponse = { draft };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const info = toApiError(err);
    return Response.json({ error: info.message, retryable: info.retryable }, { status: info.status });
  }
}
