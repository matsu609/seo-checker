/**
 * 月次レポートの型（クライアントでも読める）。数字は「当月の最後の値」と「前月の最後の値」の組で持つ。
 */
export interface ReportDelta {
  current: number | null;
  previous: number | null;
}

export interface RankChange {
  keyword: string;
  /** 圏外は null */
  from: number | null;
  to: number | null;
}

export interface RankSection {
  /** 当月に計測できた語数 */
  measured: number;
  top10: ReportDelta;
  /** 順位がある語の平均順位 */
  avgRank: ReportDelta;
  up: RankChange[];
  down: RankChange[];
}

export interface MeoStoreSection {
  name: string;
  score: ReportDelta;
  rating: ReportDelta;
  reviews: ReportDelta;
  photos: ReportDelta;
  /** Google マップ検索順位（対策キーワードごと） */
  rank: RankChange[];
}

export interface AiSection {
  /** 当月の観測数（自社ブランド） */
  observations: number;
  mentionRate: ReportDelta;
  citeRate: ReportDelta;
}

export interface SeoSection {
  runAt: string | null;
  source: "manual" | "auto" | null;
  quick: ReportDelta;
  errors: ReportDelta;
  warnings: ReportDelta;
  /** 直前の診断との差分の件数（当月の診断があるとき） */
  improved: number | null;
  worsened: number | null;
}

export interface ListingsStoreSection {
  name: string;
  live: number;
  submitted: number;
  todo: number;
  total: number;
  /** 再チェックで消えた・ずれた媒体 */
  missing: number;
  mismatch: number;
}

export interface ReviewsSection {
  responses: ReportDelta;
  averageRating: ReportDelta;
  low: number;
  clicks: number;
}

export interface MonitorSection {
  checkedAt: string | null;
  incidents: number;
  critical: number;
}

export interface ActivitySection {
  /** 当月に Google へ送れた投稿 */
  posts: number;
  /** 予約中の投稿 */
  scheduled: number;
  /** 当月の変化の知らせ（順位・事故・掲載・低評価・投稿） */
  alerts: number;
  rediagnosis: number;
  /** 自動計測が動いた回数（週） */
  autoRankRuns: number;
}

export interface MonthlyReport {
  /** YYYY-MM */
  month: string;
  generatedAt: string;
  siteDomain: string | null;
  rank: RankSection | null;
  meo: MeoStoreSection[] | null;
  ai: AiSection | null;
  seo: SeoSection | null;
  listings: ListingsStoreSection[] | null;
  reviews: ReviewsSection | null;
  monitor: MonitorSection | null;
  activity: ActivitySection;
  /** 数字から組み立てた「来月やること」（優先順） */
  actions: string[];
  /** メールと画面の先頭に出す要点（1 行ずつ） */
  summary: string[];
}
