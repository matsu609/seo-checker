/**
 * Places API (New) の応答を PlaceSummary / PlaceDetail にする。純粋関数だけを置く。
 *
 * Google の応答はフィールドマスクと SKU で中身が変わるので、すべて optional として
 * 読む。壊れた 1 件で全体を落とさないよう、1 件ずつ safeParse して失敗は捨てる。
 */
import { z } from "zod";
import type { BusinessStatus, PlaceDetail, PlaceReview, PlaceSummary } from "./types";

const LocalizedText = z.object({ text: z.string().optional() }).optional();

const RawReview = z.object({
  rating: z.number().optional(),
  text: LocalizedText,
  originalText: LocalizedText,
  publishTime: z.string().optional(),
  relativePublishTimeDescription: z.string().optional(),
  authorAttribution: z.object({ displayName: z.string().optional() }).optional(),
});

export const RawPlaceSchema = z.object({
  id: z.string().min(1),
  displayName: LocalizedText,
  formattedAddress: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  primaryTypeDisplayName: LocalizedText,
  types: z.array(z.string()).optional(),
  businessStatus: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().optional(),
  regularOpeningHours: z
    .object({ weekdayDescriptions: z.array(z.string()).optional() })
    .optional(),
  photos: z.array(z.object({ name: z.string().optional() })).optional(),
  reviews: z.array(RawReview).optional(),
  editorialSummary: LocalizedText,
  googleMapsUri: z.string().optional(),
});

export type RawPlace = z.infer<typeof RawPlaceSchema>;

const STATUSES: readonly BusinessStatus[] = ["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"];

export function toBusinessStatus(value: string | undefined): BusinessStatus {
  return (STATUSES as readonly string[]).includes(value ?? "") ? (value as BusinessStatus) : "UNKNOWN";
}

function text(value: { text?: string } | undefined): string | null {
  const t = value?.text?.trim();
  return t ? t : null;
}

export function toSummary(raw: RawPlace): PlaceSummary {
  return {
    id: raw.id,
    name: text(raw.displayName) ?? "（名称不明）",
    address: raw.formattedAddress?.trim() || null,
    rating: typeof raw.rating === "number" ? raw.rating : null,
    ratingCount: typeof raw.userRatingCount === "number" ? raw.userRatingCount : null,
    category: text(raw.primaryTypeDisplayName),
    status: toBusinessStatus(raw.businessStatus),
  };
}

function toReview(raw: z.infer<typeof RawReview>): PlaceReview {
  return {
    rating: typeof raw.rating === "number" ? raw.rating : null,
    // 翻訳済み（text）を優先し、無ければ原文
    text: text(raw.text) ?? text(raw.originalText) ?? "",
    author: raw.authorAttribution?.displayName?.trim() || null,
    publishedAt: raw.publishTime ?? null,
    relative: raw.relativePublishTimeDescription ?? null,
  };
}

export function toDetail(raw: RawPlace): PlaceDetail {
  return {
    ...toSummary(raw),
    phone: raw.nationalPhoneNumber?.trim() || null,
    website: raw.websiteUri?.trim() || null,
    hours: raw.regularOpeningHours?.weekdayDescriptions ?? [],
    photoCount: raw.photos?.length ?? 0,
    reviews: (raw.reviews ?? []).map(toReview),
    description: text(raw.editorialSummary),
    mapsUrl: raw.googleMapsUri ?? null,
    types: raw.types ?? [],
  };
}

/** searchText の応答（{ places: [...] }）から一覧を作る。壊れた要素は捨てる */
export function parseSearchResponse(body: unknown): PlaceSummary[] {
  const list = (body as { places?: unknown })?.places;
  if (!Array.isArray(list)) return [];
  const out: PlaceSummary[] = [];
  for (const item of list) {
    const parsed = RawPlaceSchema.safeParse(item);
    if (parsed.success) out.push(toSummary(parsed.data));
  }
  return out;
}

/** places/{id} の応答から詳細を作る。形が違えば null */
export function parseDetailResponse(body: unknown): PlaceDetail | null {
  const parsed = RawPlaceSchema.safeParse(body);
  return parsed.success ? toDetail(parsed.data) : null;
}
