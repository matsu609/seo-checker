/**
 * /api/reviews/forms … アンケートの一覧と作成（店舗側、ログイン必須）。
 *
 * GET  … { forms, stores }。stores は MEO に登録済みの自社店舗（Google の投稿 URL を引くため。無ければ []）
 * POST … { title, storeName, industry, placeId?, writeReviewUrl? } → 業種テンプレートの質問で作り、
 *        QR の発行単位「店舗（共通）」を 1 つ付けて返す
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { latestReports } from "@/lib/maps/history";
import { listStores } from "@/lib/maps/stores";
import { badRequest, NO_STORE, readJson, requireReviewsUser } from "@/lib/reviews/api";
import { addChannel, createForm, listForms, MAX_FORMS, writeReviewUrlFor, type ReviewChannel, type ReviewForm } from "@/lib/reviews/forms";
import { INDUSTRIES, questionsFromTemplate, ReviewFormSettingsSchema, STORE_NAME_MAX, TITLE_MAX } from "@/lib/reviews/questions";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const BodySchema = z.object({
  title: z.string().trim().min(1, "アンケートの名前を入力してください").max(TITLE_MAX),
  storeName: z.string().trim().min(1, "店名を入力してください").max(STORE_NAME_MAX),
  industry: z.enum(INDUSTRIES).default("other"),
  placeId: z.string().regex(PLACE_ID, "Place ID が正しくありません").nullable().optional(),
  writeReviewUrl: z.string().url().max(500).nullable().optional(),
});

export interface ReviewsStoreOption {
  placeId: string;
  name: string;
}

export interface ReviewsFormsResponse {
  forms: ReviewForm[];
  stores: ReviewsStoreOption[];
}

export interface ReviewsFormCreateResponse {
  form: ReviewForm;
  channels: ReviewChannel[];
}

export async function GET() {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  try {
    const forms = await listForms(userId);
    let stores: ReviewsStoreOption[] = [];
    try {
      stores = (await listStores(userId)).filter((s) => s.role === "own").map((s) => ({ placeId: s.placeId, name: s.name }));
    } catch {
      // MEO の店舗テーブルが無くても口コミ支援は使える
    }
    const body: ReviewsFormsResponse = { forms, stores };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

/** 投稿 URL: 指定 → 保存済み報告書の writeReview → Place ID から組み立て → null */
async function resolveWriteReviewUrl(userId: string, placeId: string | null, given: string | null): Promise<string | null> {
  if (given) return given;
  if (!placeId) return null;
  try {
    const entry = (await latestReports(userId, [placeId])).get(placeId);
    const link = entry?.report.detail.links?.writeReview;
    if (link) return link;
  } catch {
    // 報告書が無い・テーブルが無い → 組み立てる
  }
  return writeReviewUrlFor(placeId);
}

export async function POST(request: Request) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { title, storeName, industry } = parsed.data;
  const placeId = parsed.data.placeId ?? null;

  try {
    const existing = await listForms(userId);
    if (existing.length >= MAX_FORMS) return badRequest(`アンケートは ${MAX_FORMS} 件まで作れます`);
    const writeReviewUrl = await resolveWriteReviewUrl(userId, placeId, parsed.data.writeReviewUrl ?? null);
    const form = await createForm(userId, {
      title,
      storeName,
      placeId,
      writeReviewUrl,
      questions: questionsFromTemplate(industry),
      settings: ReviewFormSettingsSchema.parse({ industry, keywords: [storeName] }),
    });
    const channel = await addChannel(form.id, "店舗（共通）");
    const body: ReviewsFormCreateResponse = { form, channels: [channel] };
    return Response.json(body, { status: 201, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
