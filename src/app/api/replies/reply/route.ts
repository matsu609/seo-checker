/**
 * /api/replies/reply … 口コミへの返信を Google に投稿・削除する（ログイン必須）。
 *
 * PUT    … { reviewName, comment } → { reply: { comment, updatedAt } }（既に返信があれば上書き）
 * DELETE … { reviewName }
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { deleteReply, isReviewName, REPLY_MAX, replyToReview } from "@/lib/google/business-profile";
import { googleErrorResponse } from "@/lib/google/errors";

export const runtime = "nodejs";
export const maxDuration = 30;

const ReplySchema = z.object({
  reviewName: z.string().refine(isReviewName, "口コミの指定が正しくありません"),
  comment: z.string().trim().min(1, "返信の本文を入力してください").max(REPLY_MAX, `返信は ${REPLY_MAX} 文字までです`),
});
const DeleteSchema = z.object({
  reviewName: z.string().refine(isReviewName, "口コミの指定が正しくありません"),
});

export interface RepliesReplyResponse {
  reply: { comment: string; updatedAt: string | null };
}

async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const denied = await requireAuth({ feature: "replies" });
  if (denied) return denied;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = ReplySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  try {
    const reply = await replyToReview(parsed.data.reviewName, parsed.data.comment);
    const body: RepliesReplyResponse = { reply };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAuth({ feature: "replies" });
  if (denied) return denied;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = DeleteSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  try {
    await deleteReply(parsed.data.reviewName);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
