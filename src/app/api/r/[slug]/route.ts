/**
 * GET /api/r/[slug] … 来店客向けアンケートの定義（ログイン不要。src/lib/auth/routes.ts の PUBLIC_API_PREFIXES）。
 *
 * `?c=<code>` があれば、その QR に紐づく店舗（店名）で返す。`?lang=` か Accept-Language の言語に訳して返す。
 * 返すのは画面に要るものだけ（PublicReviewForm）。店舗の設定（トーン・キーワード・投稿 URL）や
 * 所有者は返さない。Supabase が未設定なら 503。
 */
import { dbErrorResponse } from "@/lib/db/supabase";
import { clientKeyOf, REVIEW_CLIENT_LIMIT_MESSAGE, REVIEW_FORM_GET_PER_HOUR, takeClientToken } from "@/lib/free/ratelimit";
import { findChannelByCode, getPublicForm, isValidChannelCode, isValidSlug, toPublicForm, type PublicReviewForm } from "@/lib/reviews/forms";
import { resolveSurveyLocale } from "@/lib/reviews/i18n";
import { translateForm } from "@/lib/reviews/translate";

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
    const params = new URL(request.url).searchParams;
    const code = params.get("c") ?? "";
    const channel = code && isValidChannelCode(code) ? await findChannelByCode(form.id, code) : null;
    const locale = resolveSurveyLocale(params.get("lang"), request.headers.get("accept-language"));
    const translation = await translateForm(form, locale);
    const body: PublicFormResponse = { form: toPublicForm(form, channel, locale, translation) };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
