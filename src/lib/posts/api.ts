/**
 * 投稿 API（/api/posts/*）で共通の前処理。サーバー専用。
 */
import { requireUser } from "@/lib/auth/guard";
import { z } from "zod";
import { CTA_TYPES, POST_SUMMARY_MAX, POST_TITLE_MAX, POST_TOPICS } from "./types";

export { NO_STORE } from "@/lib/api/headers";
export { badRequest, readJson } from "@/lib/api/request";
export { isUuid } from "@/lib/api/ids";

export const FEATURE_ID = "posts";
export const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export async function requirePostsUser(): Promise<string | Response> {
  return requireUser({ feature: FEATURE_ID });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 投稿の各項目（既定値なし）。作成用と編集用の 2 つのスキーマの元 */
const POST_FIELDS = {
  topicType: z.enum(POST_TOPICS),
  title: z.string().max(POST_TITLE_MAX),
  summary: z.string().max(POST_SUMMARY_MAX),
  ctaType: z.enum(CTA_TYPES),
  ctaUrl: z.string().max(500),
  eventStart: z.string().regex(DATE).nullable(),
  eventEnd: z.string().regex(DATE).nullable(),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
};

/** 作成用。送られなかった項目は既定値で埋める */
export const PostInputSchema = z.object({
  topicType: POST_FIELDS.topicType,
  title: POST_FIELDS.title.default(""),
  summary: POST_FIELDS.summary.default(""),
  ctaType: POST_FIELDS.ctaType.default("NONE"),
  ctaUrl: POST_FIELDS.ctaUrl.default(""),
  eventStart: POST_FIELDS.eventStart.default(null),
  eventEnd: POST_FIELDS.eventEnd.default(null),
  scheduledAt: POST_FIELDS.scheduledAt.default(null),
});

/**
 * 編集用（PATCH）。**送られてきた項目だけ**を返す。
 *
 * 2026-09-23 まで PostInputSchema.partial() を使っていたが、zod 4 の partial() は項目の既定値を
 * そのまま当てはめるため、`{ action: "cancel" }` だけを送っても題名・本文・ボタン・予約日時が
 * 空や null で埋まり、保存済みの投稿を上書きして消していた。既定値の無い項目から作る。
 */
export const PostPatchInputSchema = z.object(POST_FIELDS).partial();
