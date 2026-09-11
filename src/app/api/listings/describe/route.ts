/**
 * POST /api/listings/describe … 店舗の説明文（短い / 長い）を AI が書く。
 *
 * 本文: { profile, google?: { category, hours, reviews }, hint? }
 * 応答: { short, long }
 * Anthropic が未設定なら 503（画面はボタンを出さない）。
 */
import { z } from "zod";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { badRequest, NO_STORE, readJson, requireListingsUser } from "@/lib/listings/api";
import { generateDescriptions, HINT_MAX } from "@/lib/listings/describe";
import { ListingProfileSchema } from "@/lib/listings/profile";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  profile: ListingProfileSchema,
  google: z
    .object({
      category: z.string().max(100).nullable().default(null),
      hours: z.array(z.string().max(100)).max(7).default([]),
      reviews: z.array(z.string().max(2000)).max(5).default([]),
    })
    .nullable()
    .default(null),
  hint: z.string().max(HINT_MAX).default(""),
});

export interface ListingsDescribeResponse {
  short: string;
  long: string;
}

export async function POST(request: Request) {
  const userId = await requireListingsUser();
  if (userId instanceof Response) return userId;
  if (!isAnthropicEnabled()) return Response.json({ error: "AI の説明文には ANTHROPIC_API_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  if (!parsed.data.profile.name.trim()) return badRequest("店名を入力してください");
  try {
    const body: ListingsDescribeResponse = await generateDescriptions(parsed.data, { signal: request.signal });
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    const info = toApiError(err);
    return Response.json({ error: info.message, retryable: info.retryable }, { status: info.status });
  }
}
