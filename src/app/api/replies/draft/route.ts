/**
 * POST /api/replies/draft … 口コミへの返信案を AI が作る（ログイン必須、ANTHROPIC_API_KEY が要る）。
 * 本文: { storeName, tone, rating, text, author?, ownerNote?, signature? } → { draft }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { generateReplyDraft, OWNER_NOTE_MAX, SIGNATURE_MAX } from "@/lib/replies/draft";
import { STORE_NAME_MAX, TONES } from "@/lib/reviews/questions";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  storeName: z.string().trim().min(1, "店名がありません").max(STORE_NAME_MAX),
  tone: z.enum(TONES).default("polite"),
  rating: z.number().int().min(1).max(5).nullable(),
  text: z.string().max(5_000),
  author: z.string().max(200).nullable().optional(),
  ownerNote: z.string().max(OWNER_NOTE_MAX).optional(),
  signature: z.string().max(SIGNATURE_MAX).optional(),
});

export interface RepliesDraftResponse {
  draft: string;
}

export async function POST(request: Request) {
  const denied = await requireAuth({ feature: "replies" });
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json({ error: "AI の返信案には ANTHROPIC_API_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
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
    const draft = await generateReplyDraft(
      { storeName: d.storeName, tone: d.tone, rating: d.rating, text: d.text, author: d.author ?? null, ownerNote: d.ownerNote ?? "", signature: d.signature ?? "" },
      { signal: request.signal },
    );
    const body: RepliesDraftResponse = { draft };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const info = toApiError(err);
    return Response.json({ error: info.message, retryable: info.retryable }, { status: info.status });
  }
}
