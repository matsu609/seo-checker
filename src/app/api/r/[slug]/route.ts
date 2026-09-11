/**
 * GET /api/r/[slug] … 来店客向けアンケートの定義（ログイン不要。src/lib/auth/routes.ts の PUBLIC_API_PREFIXES）。
 *
 * 返すのは画面に要るものだけ（PublicReviewForm）。店舗の設定（トーン・キーワード・投稿 URL）や
 * 所有者は返さない。Supabase が未設定なら 503。
 */
import { dbErrorResponse } from "@/lib/db/supabase";
import { clientKeyOf, REVIEW_CLIENT_LIMIT_MESSAGE, REVIEW_FORM_GET_PER_HOUR, takeClientToken } from "@/lib/free/ratelimit";
import { getPublicForm, isValidSlug, toPublicForm, type PublicReviewForm } from "@/lib/reviews/forms";

export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = { "cache-control": "no-store" } as const;

export interface PublicFormResponse {
  form: PublicReviewForm;
}

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Ctx) {
  const { slug } = await context.params;
  if (!isValidSlug(slug)) return Response.json({ error: "このアンケートは見つかりません" }, { status: 404, headers: NO_STORE });
  if (!takeClientToken("review-form", clientKeyOf(request), REVIEW_FORM_GET_PER_HOUR)) {
    return Response.json({ error: REVIEW_CLIENT_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  try {
    const form = await getPublicForm(slug);
    if (!form) return Response.json({ error: "このアンケートは見つかりません（終了した可能性があります）" }, { status: 404, headers: NO_STORE });
    const body: PublicFormResponse = { form: toPublicForm(form) };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
