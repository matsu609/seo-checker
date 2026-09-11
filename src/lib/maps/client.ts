/**
 * Places API (New) のクライアント。サーバー専用（API キーを使う）。
 *
 * 呼ぶのは 2 本だけ。
 *   - POST /v1/places:searchText … 店名・地域で候補を探す
 *   - GET  /v1/places/{id}       … 比較・採点に使う詳細
 *
 * フィールドマスクで要求する項目が SKU（料金区分）を決める。detail は口コミと
 * 紹介文を含むため最も高い区分になるので、呼び出し側でキャッシュする。
 * 応答の解釈は parse.ts（純粋関数）に任せ、ここは通信とエラーの分類だけ。
 */
import { parseDetailResponse, parseSearchResponse } from "./parse";
import type { PlaceDetail, PlaceSummary } from "./types";

const BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 15_000;
/** 1 回の検索で返す上限（Google の上限は 20） */
export const SEARCH_LIMIT = 10;

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
].join(",");

/** r27 までの詳細（reviews と editorialSummary が入るので最も高い区分 Enterprise + Atmosphere） */
const DETAIL_FIELDS_BASE = [
  "id",
  "displayName",
  "formattedAddress",
  "rating",
  "userRatingCount",
  "primaryTypeDisplayName",
  "types",
  "businessStatus",
  "nationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours",
  "photos",
  "reviews",
  "editorialSummary",
  "googleMapsUri",
];

/**
 * r28 で足した項目。すべて Enterprise + Atmosphere 以下の区分なので、1 回の料金は変わらない
 * （1 回の呼び出しは、要求した中で最も高い区分で課金される）。
 * フィールド名は @googlemaps/places 3.0.0 の proto（place.proto）で確認したもの。
 */
const DETAIL_FIELDS_EXTRA = [
  "primaryType",
  "addressComponents",
  "location",
  "priceLevel",
  "priceRange",
  "googleMapsLinks",
  "generativeSummary",
  "reviewSummary",
  "pureServiceAreaBusiness",
  "consumerAlert",
  "accessibilityOptions",
  "parkingOptions",
  "paymentOptions",
  "takeout",
  "delivery",
  "dineIn",
  "curbsidePickup",
  "reservable",
  "servesBreakfast",
  "servesLunch",
  "servesDinner",
  "servesBeer",
  "servesWine",
  "servesBrunch",
  "servesVegetarianFood",
  "outdoorSeating",
  "liveMusic",
  "menuForChildren",
  "servesCocktails",
  "servesDessert",
  "servesCoffee",
  "goodForChildren",
  "allowsDogs",
  "restroom",
  "goodForGroups",
  "goodForWatchingSports",
];

export const DETAIL_FIELDS = [...DETAIL_FIELDS_BASE, ...DETAIL_FIELDS_EXTRA].join(",");
const DETAIL_FIELDS_FALLBACK = DETAIL_FIELDS_BASE.join(",");

export type PlacesErrorCode = "not_configured" | "denied" | "rate_limited" | "not_found" | "invalid" | "upstream";

export class PlacesError extends Error {
  constructor(
    message: string,
    public readonly code: PlacesErrorCode,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

export function isPlacesConfigured(): boolean {
  return (process.env.GOOGLE_PLACES_API_KEY ?? "").trim().length > 0;
}

function apiKey(): string {
  const key = (process.env.GOOGLE_PLACES_API_KEY ?? "").trim();
  if (!key) throw new PlacesError("Google マップの連携（GOOGLE_PLACES_API_KEY）が設定されていません。", "not_configured");
  return key;
}

/** Google のエラー応答（{ error: { code, status, message } }）を分類する */
function classify(status: number, body: unknown): PlacesError {
  const err = (body as { error?: { status?: string; message?: string } })?.error;
  const upstream = err?.message ? `（Google: ${err.message}）` : "";
  if (status === 400) return new PlacesError(`Google が入力を受け付けませんでした${upstream}`, "invalid");
  if (status === 403 || err?.status === "PERMISSION_DENIED") {
    return new PlacesError(
      `Google マップの API を呼べませんでした。API キーの制限、Places API (New) の有効化、請求先アカウントの設定を確認してください${upstream}`,
      "denied",
    );
  }
  if (status === 404) return new PlacesError("その店舗は見つかりませんでした。", "not_found");
  if (status === 429 || err?.status === "RESOURCE_EXHAUSTED") {
    return new PlacesError("Google マップの API の上限に達しました。しばらく待ってから再度お試しください。", "rate_limited");
  }
  return new PlacesError(`Google マップの API がエラーを返しました（HTTP ${status}）${upstream}`, "upstream");
}

async function call(path: string, init: RequestInit, fieldMask: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": fieldMask,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw classify(res.status, body);
  return body;
}

/** 店名・地域などの文字列で候補を探す（日本語・日本を優先） */
export async function searchPlaces(query: string, limit = SEARCH_LIMIT): Promise<PlaceSummary[]> {
  const body = await call(
    "/places:searchText",
    {
      method: "POST",
      body: JSON.stringify({
        textQuery: query,
        languageCode: "ja",
        regionCode: "JP",
        pageSize: Math.min(Math.max(limit, 1), 20),
      }),
    },
    SEARCH_FIELDS,
  );
  return parseSearchResponse(body);
}

/**
 * Place ID から詳細を取る。
 * Google がフィールドマスクの項目名を受け付けなかったとき（400。API 側で名前が変わった場合）は、
 * r27 までの項目だけで 1 回だけ取り直す（追加項目は空になるが、報告書は止めない）。
 */
export async function getPlace(placeId: string): Promise<PlaceDetail> {
  const path = `/places/${encodeURIComponent(placeId)}?languageCode=ja&regionCode=JP`;
  let body: unknown;
  try {
    body = await call(path, { method: "GET" }, DETAIL_FIELDS);
  } catch (err) {
    if (!(err instanceof PlacesError && err.code === "invalid")) throw err;
    console.warn("[maps] 拡張フィールドマスクが拒否されたため基本項目だけで取り直します", err.message);
    body = await call(path, { method: "GET" }, DETAIL_FIELDS_FALLBACK);
  }
  const detail = parseDetailResponse(body);
  if (!detail) throw new PlacesError("Google マップの応答を読み取れませんでした。", "upstream");
  return detail;
}

const STATUS_BY_CODE: Record<PlacesErrorCode, number> = {
  not_configured: 503,
  denied: 502,
  rate_limited: 429,
  not_found: 404,
  invalid: 400,
  upstream: 502,
};

/** API ルート用。PlacesError なら分類どおりの status、それ以外は 500 */
export function placesErrorResponse(err: unknown): Response {
  if (err instanceof PlacesError) {
    return Response.json({ error: err.message, code: err.code }, { status: STATUS_BY_CODE[err.code] });
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return Response.json({ error: "Google マップの API が応答しませんでした。時間をおいて再度お試しください。" }, { status: 504 });
  }
  console.error("[maps] unexpected error", err);
  return Response.json({ error: "店舗情報の取得中にエラーが発生しました。" }, { status: 500 });
}
