/**
 * Google マップ（Places API (New)）から取る店舗情報の型。
 *
 * Places API は項目ごとに「取れないことがある」前提（権限・SKU・データの有無）なので、
 * 無い項目は null / 空配列にして「未取得」として扱う。0 や「なし」と混同しない。
 */

export type BusinessStatus = "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | "UNKNOWN";

/** 比較に並べる競合の上限（自社 1 件 + これ）。詳細 1 件ごとに API 費用がかかるため絞る */
export const MAX_COMPETITORS = 5;
export const MAX_PLACES = MAX_COMPETITORS + 1;

/** 検索結果の 1 件（自社・競合を選ぶための最小限） */
export interface PlaceSummary {
  /** Google の Place ID */
  id: string;
  name: string;
  address: string | null;
  /** 1.0〜5.0。評価が無ければ null */
  rating: number | null;
  ratingCount: number | null;
  /** Google が表示する主カテゴリ（例: 美容院） */
  category: string | null;
  status: BusinessStatus;
}

export interface PlaceReview {
  rating: number | null;
  text: string;
  author: string | null;
  /** ISO 8601。無ければ null */
  publishedAt: string | null;
  /** 「2 週間前」のような Google の相対表記 */
  relative: string | null;
}

/** 比較・採点に使う詳細 */
export interface PlaceDetail extends PlaceSummary {
  phone: string | null;
  website: string | null;
  /** 曜日ごとの営業時間の文字列（例: "月曜日: 10時00分～19時00分"） */
  hours: string[];
  photoCount: number;
  /** Google が返すのは最大 5 件 */
  reviews: PlaceReview[];
  /** Google 側の紹介文（オーナーが書いた説明文は Places API では取れない） */
  description: string | null;
  mapsUrl: string | null;
  /** カテゴリの内部 ID（例: hair_salon） */
  types: string[];
}
