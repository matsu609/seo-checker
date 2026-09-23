/** Search Console の型（アプリ側で使う形） */

/** sites.list の 1 件 */
export interface SearchConsoleSite {
  /** "https://example.com/" または "sc-domain:example.com" */
  siteUrl: string;
  /** siteOwner / siteFullUser / siteRestrictedUser / siteUnverifiedUser */
  permissionLevel: string;
  /** ドメインプロパティか（sc-domain: 形式） */
  isDomainProperty: boolean;
  /** 画面に出す名前 */
  label: string;
}

/** searchAnalytics.query の 1 行 */
export interface SearchAnalyticsRow {
  /** dimensions と同じ順の値（query / page / date など） */
  keys: string[];
  clicks: number;
  impressions: number;
  /** 0〜1。Google の生値をそのまま持つ（表示側で % にする） */
  ctr: number;
  /** 平均掲載順位。1 が最上位 */
  position: number;
}

export interface SearchAnalyticsResult {
  rows: SearchAnalyticsRow[];
  /** 期間内の合計（rows とは別に、dimensions 無しで取得したもの） */
  totals: Omit<SearchAnalyticsRow, "keys"> | null;
}

/**
 * 使える次元。`searchAppearance`（検索での見え方）は他の次元と組み合わせられない
 * ので、単独で問い合わせる。
 */
export type SearchAnalyticsDimension = "query" | "page" | "date" | "country" | "device" | "searchAppearance";

export interface SearchAnalyticsQuery {
  startDate: string;
  endDate: string;
  dimensions?: SearchAnalyticsDimension[];
  rowLimit?: number;
  startRow?: number;
}

export interface SearchConsoleClient {
  listSites(): Promise<SearchConsoleSite[]>;
  query(siteUrl: string, q: SearchAnalyticsQuery): Promise<SearchAnalyticsRow[]>;
}

/** POST /api/search-console/performance の応答（画面とルートで共有する） */
export interface SearchPerformanceResponse {
  siteUrl: string;
  range: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
  /** 期間の合計 */
  totals: Omit<SearchAnalyticsRow, "keys">;
  /** 前期間の合計（比較用） */
  previousTotals: Omit<SearchAnalyticsRow, "keys">;
  /** 日別（keys[0] が日付） */
  daily: SearchAnalyticsRow[];
  /** クリックの多い順のクエリ */
  queries: SearchAnalyticsRow[];
  /** クリックの多い順のページ */
  pages: SearchAnalyticsRow[];
  /** データ確定の遅れ（画面の注記に出す） */
  lagDays: number;
}
