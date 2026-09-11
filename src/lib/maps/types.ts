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

export interface LatLng {
  lat: number;
  lng: number;
}

/** 設備・サービスなどの属性（Google が返した分だけ。true / false の両方があり得る） */
export interface PlaceAttribute {
  /** 例: paymentOptions.acceptsCreditCards */
  key: string;
  label: string;
  value: boolean;
}

/** Google が返す写真の情報（最大 10 枚。画像そのものは取らない） */
export interface PlacePhoto {
  widthPx: number | null;
  heightPx: number | null;
  /** 投稿者名（オーナー投稿なら店名になる） */
  author: string | null;
}

/** Google マップ内の各画面へのリンク（口コミ投稿画面など） */
export interface PlaceLinks {
  directions: string | null;
  place: string | null;
  writeReview: string | null;
  reviews: string | null;
  photos: string | null;
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

  /* ── r28 で追加（フィールドマスクの拡張。料金区分は変わらない）。古い保存分には無い（undefined） ── */

  /** メインカテゴリの内部 ID（例: hair_salon） */
  primaryType?: string | null;
  /** 追加カテゴリ（メインと汎用的な type を除いた内部 ID） */
  extraTypes?: string[];
  /** 住所にビル名・階・部屋番号（premise / subpremise / floor / room）が含まれるか。住所要素が無ければ null */
  hasBuilding?: boolean | null;
  location?: LatLng | null;
  /** 価格帯の表示（例: "¥¥" や "¥1,000〜¥2,000"）。無ければ null */
  price?: string | null;
  attributes?: PlaceAttribute[];
  photos?: PlacePhoto[];
  links?: PlaceLinks | null;
  /** Google の AI 要約（generativeSummary / reviewSummary）。日本では無いことが多い */
  aiSummary?: string | null;
  /** 店舗を持たない出張型ビジネス */
  serviceArea?: boolean;
  /** Google の警告（不審な口コミ活動やポリシー違反）。無ければ null */
  consumerAlert?: string | null;
}
