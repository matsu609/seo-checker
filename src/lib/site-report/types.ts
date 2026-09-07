/**
 * サイトレポート（E8）の共通型。
 *
 * サーバー（/api/site-report）とクライアント（画面・集計）の両方から参照するので、
 * ここにはネットワークにも localStorage にも触らない型と定数だけを置く。
 * 順位側（登録キーワード・スナップショット）はブラウザの rankStore が持つため、
 * このレスポンスには GA4 由来の数字しか入らない。
 */
import type { DateRange } from "@/lib/ga4/period";

/** GA4 から取る素の指標（1 期間分）。前期比の計算は kpi.ts の純関数に任せる */
export interface SiteMetrics {
  /** ユーザー数 */
  totalUsers: number;
  /** 新しいユーザー */
  newUsers: number;
  /** エンゲージメント時間の合計（秒）。平均は userEngagementDuration / activeUsers */
  userEngagementDuration: number;
  /** アクティブユーザー（平均エンゲージメント時間の分母） */
  activeUsers: number;
  /** エンゲージメント率（0〜1） */
  engagementRate: number;
  /** コンバージョン（キーイベント） */
  keyEvents: number;
  /** 自然検索セッション（sessionDefaultChannelGroup = "Organic Search"） */
  organicSessions: number;
}

export const EMPTY_SITE_METRICS: SiteMetrics = {
  totalUsers: 0,
  newUsers: 0,
  userEngagementDuration: 0,
  activeUsers: 0,
  engagementRate: 0,
  keyEvents: 0,
  organicSessions: 0,
};

/** 日 × チャネルの 1 行（積み上げ棒の素データ） */
export interface ChannelDailyRow {
  /** YYYY-MM-DD */
  date: string;
  /** GA4 の sessionDefaultChannelGroup */
  channel: string;
  sessions: number;
  users: number;
}

/** POST /api/site-report のリクエスト */
export interface SiteReportRequest {
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /** 前期（省略すると「同じ日数だけ直前」を server が計算する） */
  previousStartDate?: string;
  previousEndDate?: string;
}

/** POST /api/site-report のレスポンス */
export interface SiteReportResponse {
  range: DateRange;
  previousRange: DateRange;
  /** 当期の指標 */
  current: SiteMetrics;
  /** 前期の指標 */
  previous: SiteMetrics;
  /** 当期のチャネル別時系列（前期は KPI カードだけで使うので取得しない） */
  channels: ChannelDailyRow[];
  fetchedAt: string;
  /** GA4 の取得上限に達して打ち切った */
  truncated: boolean;
  /** サーバー側キャッシュから返した */
  cached?: boolean;
}
