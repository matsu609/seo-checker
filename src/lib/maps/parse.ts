/**
 * Places API (New) の応答を PlaceSummary / PlaceDetail にする。純粋関数だけを置く。
 *
 * Google の応答はフィールドマスクと SKU で中身が変わるので、すべて optional として
 * 読む。壊れた 1 件で全体を落とさないよう、1 件ずつ safeParse して失敗は捨てる。
 */
import { z } from "zod";
import type { BusinessStatus, PlaceAttribute, PlaceDetail, PlaceLinks, PlacePhoto, PlaceReview, PlaceSummary } from "./types";

const LocalizedText = z.object({ text: z.string().optional() }).optional();
const OptBool = z.boolean().optional();
const Money = z.object({ currencyCode: z.string().optional(), units: z.union([z.string(), z.number()]).optional(), nanos: z.number().optional() }).optional();

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
  photos: z
    .array(
      z.object({
        name: z.string().optional(),
        widthPx: z.number().optional(),
        heightPx: z.number().optional(),
        authorAttributions: z.array(z.object({ displayName: z.string().optional() })).optional(),
      }),
    )
    .optional(),
  reviews: z.array(RawReview).optional(),
  editorialSummary: LocalizedText,
  googleMapsUri: z.string().optional(),
  // ── r28 で追加 ──
  primaryType: z.string().optional(),
  addressComponents: z.array(z.object({ types: z.array(z.string()).optional() })).optional(),
  location: z.object({ latitude: z.number().optional(), longitude: z.number().optional() }).optional(),
  priceLevel: z.string().optional(),
  priceRange: z.object({ startPrice: Money, endPrice: Money }).optional(),
  googleMapsLinks: z
    .object({
      directionsUri: z.string().optional(),
      placeUri: z.string().optional(),
      writeAReviewUri: z.string().optional(),
      reviewsUri: z.string().optional(),
      photosUri: z.string().optional(),
    })
    .optional(),
  generativeSummary: z.object({ overview: LocalizedText }).optional(),
  reviewSummary: z.object({ text: LocalizedText }).optional(),
  pureServiceAreaBusiness: OptBool,
  consumerAlert: z.object({ overview: z.string().optional() }).optional(),
  accessibilityOptions: z
    .object({
      wheelchairAccessibleParking: OptBool,
      wheelchairAccessibleEntrance: OptBool,
      wheelchairAccessibleRestroom: OptBool,
      wheelchairAccessibleSeating: OptBool,
    })
    .optional(),
  parkingOptions: z
    .object({
      freeParkingLot: OptBool,
      paidParkingLot: OptBool,
      freeStreetParking: OptBool,
      paidStreetParking: OptBool,
      valetParking: OptBool,
      freeGarageParking: OptBool,
      paidGarageParking: OptBool,
    })
    .optional(),
  paymentOptions: z
    .object({ acceptsCreditCards: OptBool, acceptsDebitCards: OptBool, acceptsCashOnly: OptBool, acceptsNfc: OptBool })
    .optional(),
  takeout: OptBool,
  delivery: OptBool,
  dineIn: OptBool,
  curbsidePickup: OptBool,
  reservable: OptBool,
  servesBreakfast: OptBool,
  servesLunch: OptBool,
  servesDinner: OptBool,
  servesBeer: OptBool,
  servesWine: OptBool,
  servesBrunch: OptBool,
  servesVegetarianFood: OptBool,
  outdoorSeating: OptBool,
  liveMusic: OptBool,
  menuForChildren: OptBool,
  servesCocktails: OptBool,
  servesDessert: OptBool,
  servesCoffee: OptBool,
  goodForChildren: OptBool,
  allowsDogs: OptBool,
  restroom: OptBool,
  goodForGroups: OptBool,
  goodForWatchingSports: OptBool,
});

/** 属性の日本語ラベル（キーは Places API のフィールド名。入れ子は "親.子"） */
export const ATTRIBUTE_LABELS: Record<string, string> = {
  "accessibilityOptions.wheelchairAccessibleParking": "車いす対応の駐車場",
  "accessibilityOptions.wheelchairAccessibleEntrance": "車いす対応の入口",
  "accessibilityOptions.wheelchairAccessibleRestroom": "車いす対応のトイレ",
  "accessibilityOptions.wheelchairAccessibleSeating": "車いす対応の座席",
  "parkingOptions.freeParkingLot": "無料駐車場",
  "parkingOptions.paidParkingLot": "有料駐車場",
  "parkingOptions.freeStreetParking": "無料の路上駐車",
  "parkingOptions.paidStreetParking": "有料の路上駐車",
  "parkingOptions.valetParking": "バレーパーキング",
  "parkingOptions.freeGarageParking": "無料のガレージ駐車",
  "parkingOptions.paidGarageParking": "有料のガレージ駐車",
  "paymentOptions.acceptsCreditCards": "クレジットカード",
  "paymentOptions.acceptsDebitCards": "デビットカード",
  "paymentOptions.acceptsCashOnly": "現金のみ",
  "paymentOptions.acceptsNfc": "タッチ決済（NFC）",
  takeout: "テイクアウト",
  delivery: "デリバリー",
  dineIn: "店内飲食",
  curbsidePickup: "店頭受け取り",
  reservable: "予約可",
  servesBreakfast: "朝食",
  servesLunch: "昼食",
  servesDinner: "夕食",
  servesBeer: "ビール",
  servesWine: "ワイン",
  servesBrunch: "ブランチ",
  servesVegetarianFood: "ベジタリアン料理",
  outdoorSeating: "屋外席",
  liveMusic: "ライブ音楽",
  menuForChildren: "子ども向けメニュー",
  servesCocktails: "カクテル",
  servesDessert: "デザート",
  servesCoffee: "コーヒー",
  goodForChildren: "子ども連れ歓迎",
  allowsDogs: "犬の同伴可",
  restroom: "トイレ",
  goodForGroups: "グループ向け",
  goodForWatchingSports: "スポーツ観戦向け",
};

/** カテゴリとしては意味の薄い汎用 type（追加カテゴリの数から除く） */
const GENERIC_TYPES = new Set([
  "point_of_interest",
  "establishment",
  "food",
  "store",
  "health",
  "finance",
  "general_contractor",
  "geocode",
  "locality",
  "political",
  "premise",
  "route",
  "sublocality",
]);

/** 住所要素のうち「建物より細かい」もの */
const BUILDING_TYPES = new Set(["premise", "subpremise", "floor", "room"]);

const PRICE_LEVEL_LABEL: Record<string, string> = {
  PRICE_LEVEL_FREE: "無料",
  PRICE_LEVEL_INEXPENSIVE: "¥（安め）",
  PRICE_LEVEL_MODERATE: "¥¥（普通）",
  PRICE_LEVEL_EXPENSIVE: "¥¥¥（高め）",
  PRICE_LEVEL_VERY_EXPENSIVE: "¥¥¥¥（非常に高め）",
};

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

function money(m: z.infer<typeof Money>): string | null {
  if (!m) return null;
  const units = typeof m.units === "string" ? Number(m.units) : (m.units ?? 0);
  if (!Number.isFinite(units)) return null;
  const value = units + (m.nanos ?? 0) / 1e9;
  const symbol = m.currencyCode === "JPY" || !m.currencyCode ? "¥" : `${m.currencyCode} `;
  return `${symbol}${Math.round(value).toLocaleString("ja-JP")}`;
}

/** 価格帯の表示。範囲があればそれを、無ければ価格レベルを */
export function toPrice(raw: Pick<RawPlace, "priceLevel" | "priceRange">): string | null {
  const start = money(raw.priceRange?.startPrice);
  const end = money(raw.priceRange?.endPrice);
  if (start && end) return `${start}〜${end}`;
  if (start) return `${start}〜`;
  if (end) return `〜${end}`;
  return raw.priceLevel ? (PRICE_LEVEL_LABEL[raw.priceLevel] ?? null) : null;
}

/** Google が返した属性だけを、日本語ラベルつきで並べる（順番は ATTRIBUTE_LABELS の定義順） */
export function toAttributes(raw: RawPlace): PlaceAttribute[] {
  const out: PlaceAttribute[] = [];
  const bag = raw as unknown as Record<string, unknown>;
  for (const key of Object.keys(ATTRIBUTE_LABELS)) {
    const [parent, child] = key.split(".");
    const top = bag[parent];
    const value = child ? (top && typeof top === "object" ? (top as Record<string, unknown>)[child] : undefined) : top;
    if (typeof value === "boolean") out.push({ key, label: ATTRIBUTE_LABELS[key], value });
  }
  return out;
}

export function toExtraTypes(types: readonly string[], primaryType: string | null): string[] {
  return types.filter((t) => t !== primaryType && !GENERIC_TYPES.has(t));
}

function toPhotos(raw: RawPlace): PlacePhoto[] {
  return (raw.photos ?? []).map((p) => ({
    widthPx: typeof p.widthPx === "number" ? p.widthPx : null,
    heightPx: typeof p.heightPx === "number" ? p.heightPx : null,
    author: p.authorAttributions?.[0]?.displayName?.trim() || null,
  }));
}

function toLinks(raw: RawPlace): PlaceLinks | null {
  const l = raw.googleMapsLinks;
  if (!l) return null;
  return {
    directions: l.directionsUri ?? null,
    place: l.placeUri ?? null,
    writeReview: l.writeAReviewUri ?? null,
    reviews: l.reviewsUri ?? null,
    photos: l.photosUri ?? null,
  };
}

export function toDetail(raw: RawPlace): PlaceDetail {
  const primaryType = raw.primaryType?.trim() || null;
  const components = raw.addressComponents;
  const lat = raw.location?.latitude;
  const lng = raw.location?.longitude;
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
    primaryType,
    extraTypes: toExtraTypes(raw.types ?? [], primaryType),
    hasBuilding: components ? components.some((c) => (c.types ?? []).some((t) => BUILDING_TYPES.has(t))) : null,
    location: typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null,
    price: toPrice(raw),
    attributes: toAttributes(raw),
    photos: toPhotos(raw),
    links: toLinks(raw),
    aiSummary: text(raw.generativeSummary?.overview) ?? text(raw.reviewSummary?.text),
    serviceArea: raw.pureServiceAreaBusiness === true,
    consumerAlert: raw.consumerAlert?.overview?.trim() || null,
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
