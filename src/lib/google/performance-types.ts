/**
 * Business Profile Performance API の型と表示用の定数。クライアントでも読める（Clerk を import しない）。
 * 通信と集計は performance.ts（サーバー専用）。
 */

/** Google の dailyMetric の名前（このまま API に渡す） */
export const DAILY_METRICS = [
  "BUSINESS_IMPRESSIONS_DESKTOP_MAPS",
  "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH",
  "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
  "BUSINESS_IMPRESSIONS_MOBILE_SEARCH",
  "CALL_CLICKS",
  "WEBSITE_CLICKS",
  "BUSINESS_DIRECTION_REQUESTS",
  "BUSINESS_CONVERSATIONS",
  "BUSINESS_BOOKINGS",
] as const;
export type DailyMetric = (typeof DAILY_METRICS)[number];

/** 画面に出す指標（表示回数はマップ / 検索にまとめる） */
export const PERFORMANCE_KEYS = ["impressions", "impressionsMaps", "impressionsSearch", "calls", "websiteClicks", "directions", "conversations", "bookings"] as const;
export type PerformanceKey = (typeof PERFORMANCE_KEYS)[number];

export const PERFORMANCE_LABELS: Record<PerformanceKey, string> = {
  impressions: "表示回数（合計）",
  impressionsMaps: "マップ表示",
  impressionsSearch: "検索表示",
  calls: "電話クリック数",
  websiteClicks: "ウェブサイトクリック数",
  directions: "ルート検索回数",
  conversations: "メッセージ数",
  bookings: "予約数",
};

/** 「ユーザーアクション」= 電話 + サイト + ルート + メッセージ + 予約 */
export const ACTION_KEYS: readonly PerformanceKey[] = ["calls", "websiteClicks", "directions", "conversations", "bookings"];

export interface DailyPoint {
  metric: DailyMetric;
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

export interface SearchKeywordCount {
  keyword: string;
  impressions: number;
  /** Google が「～N」と丸めて返した（少ない語）。値は上限 N */
  approximate: boolean;
}

/** 月ごとの合計（key → 値）。無い指標は 0 */
export type MonthlyTotals = Record<PerformanceKey, number>;

export interface MonthRow {
  /** YYYY-MM */
  month: string;
  totals: MonthlyTotals;
  /** その月に 1 日でもデータがあったか（無い月は Google がまだ出していない） */
  hasData: boolean;
}

export interface KeywordChange {
  keyword: string;
  current: number | null;
  previous: number | null;
  /** current - previous（片方が無ければ null） */
  delta: number | null;
  approximate: boolean;
}

export interface PerformanceSummary {
  /** 集計した月（YYYY-MM） */
  month: string;
  previousMonth: string;
  current: MonthlyTotals;
  previous: MonthlyTotals;
  /** 直近の月が先頭。最大 18 か月 */
  months: MonthRow[];
  /** 当月のユーザーアクション合計と前月比 */
  actions: { current: number; previous: number };
  keywords: KeywordChange[];
  /** 伸びた / 落ちた TOP3（両月にある語だけ） */
  risers: KeywordChange[];
  fallers: KeywordChange[];
}
