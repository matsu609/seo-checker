/**
 * /api/reviews/forms/[id] … アンケート 1 件（店舗側、ログイン必須）。
 *
 * GET    … { form, channels }
 * PUT    … { title?, storeName?, placeId?, writeReviewUrl?, questions?, settings?, active? } → { form }
 * DELETE … 消す（回答と QR も外部キーの cascade で消える）
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, NO_STORE, ownedForm, readJson, requireReviewsUser } from "@/lib/reviews/api";
import { deleteForm, listChannels, updateForm, writeReviewUrlFor, type FormPatch, type ReviewChannel, type ReviewForm } from "@/lib/reviews/forms";
import { QuestionsSchema, ReviewFormSettingsSchema, STORE_NAME_MAX, TITLE_MAX } from "@/lib/reviews/questions";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const BodySchema = z.object({
  title: z.string().trim().min(1, "アンケートの名前を入力してください").max(TITLE_MAX).optional(),
  storeName: z.string().trim().min(1, "店名を入力してください").max(STORE_NAME_MAX).optional(),
  placeId: z.string().regex(PLACE_ID, "Place ID が正しくありません").nullable().optional(),
  writeReviewUrl: z.string().url("投稿 URL の形式が正しくありません").max(500).nullable().optional(),
  questions: QuestionsSchema.optional(),
  settings: ReviewFormSettingsSchema.optional(),
  active: z.boolean().optional(),
});

export interface ReviewsFormResponse {
  form: ReviewForm;
  channels: ReviewChannel[];
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Ctx) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  try {
    const form = await ownedForm(userId, id);
    if (form instanceof Response) return form;
    const body: ReviewsFormResponse = { form, channels: await listChannels(form.id) };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function PUT(request: Request, context: Ctx) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");

  try {
    const current = await ownedForm(userId, id);
    if (current instanceof Response) return current;
    const patch: FormPatch = { ...parsed.data };
    // Place ID を変えて投稿 URL を指定しなかったときは、Place ID から組み立て直す
    if (parsed.data.placeId !== undefined && parsed.data.writeReviewUrl === undefined) {
      patch.writeReviewUrl = parsed.data.placeId ? writeReviewUrlFor(parsed.data.placeId) : null;
    }
    const form = await updateForm(userId, id, patch);
    if (!form) return Response.json({ error: "そのアンケートは見つかりません" }, { status: 404 });
    const body: ReviewsFormResponse = { form, channels: await listChannels(form.id) };
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
    const form = await ownedForm(userId, id);
    if (form instanceof Response) return form;
    await deleteForm(userId, form.id);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
