/**
 * POST /api/r/[slug]/answers … 来店客の回答を保存し、口コミの下書きを返す（ログイン不要）。
 *
 * 本文: { code?: string, lang?: string, answers: Record<questionId, value> }（lang は画面の言語。下書きをその言語で書き、回答に記録する）
 * 応答: { responseId, token, isLow, draft, draftSource, writeReviewUrl }
 *
 * 守り: IP ごと 30 回 / 時、アンケートごと 1 日 500 件（REVIEW_FORM_DAILY_LIMIT）。
 * AI 下書きは 1 日の全体上限（REVIEW_AI_DAILY_LIMIT）を超えたらルールの下書きに落とす
 * （回答の受付は止めない。店舗に声が届くことが主目的のため）。
 *
 * token は、この回答者だけが押下の記録・「お店に直接伝える」を送れるようにするもの。
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import {
  clientKeyOf,
  envInt,
  REVIEW_AI_DAILY_DEFAULT,
  REVIEW_ANSWER_PER_HOUR,
  REVIEW_CLIENT_LIMIT_MESSAGE,
  REVIEW_FORM_DAILY_DEFAULT,
  REVIEW_FORM_LIMIT_MESSAGE,
  takeClientToken,
  takeDailyToken,
} from "@/lib/free/ratelimit";
import { generateReviewDraft } from "@/lib/reviews/draft";
import { findChannelByCode, getPublicForm, isValidSlug, resolveStore } from "@/lib/reviews/forms";
import { DEFAULT_LOCALE, localeFromParam } from "@/lib/reviews/i18n";
import { isLowRating, RawAnswersSchema, validateAnswers } from "@/lib/reviews/questions";
import { insertResponse, newEditToken, type DraftSource } from "@/lib/reviews/responses";

export const runtime = "nodejs";
export const maxDuration = 30;

const NO_STORE = { "cache-control": "no-store" } as const;

const BodySchema = z.object({
  code: z.string().max(8).optional(),
  lang: z.string().max(10).optional(),
  answers: RawAnswersSchema,
});

export interface PublicAnswerResponse {
  responseId: string;
  token: string;
  isLow: boolean;
  draft: string | null;
  draftSource: DraftSource;
  writeReviewUrl: string | null;
}

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Ctx) {
  const { slug } = await context.params;
  if (!isValidSlug(slug)) return Response.json({ error: "このアンケートは見つかりません" }, { status: 404, headers: NO_STORE });
  if (!takeClientToken("review-answer", clientKeyOf(request), REVIEW_ANSWER_PER_HOUR)) {
    return Response.json({ error: REVIEW_CLIENT_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "回答の形式が正しくありません" }, { status: 400, headers: NO_STORE });

  try {
    const form = await getPublicForm(slug);
    if (!form) return Response.json({ error: "このアンケートは見つかりません（終了した可能性があります）" }, { status: 404, headers: NO_STORE });

    const validated = validateAnswers(form.questions, parsed.data.answers);
    if ("error" in validated) return Response.json({ error: validated.error }, { status: 400, headers: NO_STORE });
    if (Object.keys(validated.answers).length === 0) {
      return Response.json({ error: "1 つ以上の質問に答えてください" }, { status: 400, headers: NO_STORE });
    }

    if (!takeDailyToken(`review-form:${form.id}`, envInt("REVIEW_FORM_DAILY_LIMIT", REVIEW_FORM_DAILY_DEFAULT))) {
      return Response.json({ error: REVIEW_FORM_LIMIT_MESSAGE, code: "daily_limit" }, { status: 429, headers: NO_STORE });
    }

    const channel = parsed.data.code ? await findChannelByCode(form.id, parsed.data.code) : null;
    // QR に店舗が紐づいていれば、下書きの店名と投稿先はその店舗
    const store = resolveStore(form, channel);
    const isLow = isLowRating(validated.rating, form.settings);
    const locale = localeFromParam(parsed.data.lang) ?? DEFAULT_LOCALE;
    const allowAi = takeDailyToken("review-ai", envInt("REVIEW_AI_DAILY_LIMIT", REVIEW_AI_DAILY_DEFAULT));
    const { draft, source } = await generateReviewDraft(
      { storeName: store.storeName, questions: form.questions, answers: validated.answers, rating: validated.rating, settings: form.settings, locale },
      { allowAi, signal: request.signal },
    );

    const token = newEditToken();
    const saved = await insertResponse({
      formId: form.id,
      channelId: channel?.id ?? null,
      rating: validated.rating,
      answers: validated.answers,
      isLow,
      draft,
      draftSource: source,
      editToken: token,
      lang: locale,
    });
    const body: PublicAnswerResponse = {
      responseId: saved.id,
      token,
      isLow,
      draft,
      draftSource: source,
      writeReviewUrl: store.writeReviewUrl,
    };
    return Response.json(body, { status: 201, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
