/**
 * /api/reviews/responses/[id] … 回答 1 件の対応状態・メモ（店舗側、ログイン必須）。
 *
 * PATCH  … { status?, note? } → { response }
 * DELETE … 消す
 *
 * 回答の行には user_id が無いので、行の form_id が自分のアンケートかを必ず確かめる。
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, isUuid, NO_STORE, ownedForm, readJson, requireReviewsUser } from "@/lib/reviews/api";
import { NOTE_MAX } from "@/lib/reviews/questions";
import { deleteResponse, getResponse, RESPONSE_STATUSES, updateResponse, type ReviewResponse } from "@/lib/reviews/responses";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z
  .object({
    status: z.enum(RESPONSE_STATUSES).optional(),
    note: z.string().max(NOTE_MAX).nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.note !== undefined, { message: "変更する内容がありません" });

export interface ReviewsResponseUpdateResponse {
  response: ReviewResponse;
}

type Ctx = { params: Promise<{ id: string }> };

async function owned(userId: string, id: string): Promise<ReviewResponse | Response> {
  if (!isUuid(id)) return badRequest("回答の ID が正しくありません");
  const response = await getResponse(id);
  if (!response) return Response.json({ error: "その回答は見つかりません" }, { status: 404 });
  const form = await ownedForm(userId, response.formId);
  if (form instanceof Response) return Response.json({ error: "その回答は見つかりません" }, { status: 404 });
  return response;
}

export async function PATCH(request: Request, context: Ctx) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");

  try {
    const current = await owned(userId, id);
    if (current instanceof Response) return current;
    const note = parsed.data.note === undefined ? undefined : parsed.data.note?.trim() || null;
    const response = await updateResponse(current.formId, current.id, { status: parsed.data.status, note });
    if (!response) return Response.json({ error: "その回答は見つかりません" }, { status: 404 });
    const body: ReviewsResponseUpdateResponse = { response };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  try {
    const current = await owned(userId, id);
    if (current instanceof Response) return current;
    await deleteResponse(current.formId, current.id);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
