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

export type SearchAnalyticsDimension = "query" | "page" | "date" | "country" | "device";

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
