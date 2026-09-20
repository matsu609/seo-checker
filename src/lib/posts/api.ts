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

export const PostInputSchema = z.object({
  topicType: z.enum(POST_TOPICS),
  title: z.string().max(POST_TITLE_MAX).default(""),
  summary: z.string().max(POST_SUMMARY_MAX).default(""),
  ctaType: z.enum(CTA_TYPES).default("NONE"),
  ctaUrl: z.string().max(500).default(""),
  eventStart: z.string().regex(DATE).nullable().default(null),
  eventEnd: z.string().regex(DATE).nullable().default(null),
  scheduledAt: z.string().datetime({ offset: true }).nullable().default(null),
});
