/**
 * アクセス解析（自前の計測タグ）の型。純粋なデータだけを置く（クライアントからも読める）。
 *
 * GA4 の代わりに、こちらが配る 1 行のタグ（/t.js）でお客様のサイトの訪問を記録する
 * （利用者の決定 2026-09-17: Google Search Console / GA4 は使わない。
 * 設計は docs/dev/gsc-ga4-substitute-design.md の第 2 段）。
 *
 * プライバシーの設計（第 7 条・第 12 条の根拠になるので、変えるときはポリシーも直す）:
 * - Cookie も localStorage も使わない
 * - IP アドレスは保存しない。訪問者の識別子は「日替わりの塩 + サイト + IP + UA」のハッシュで、翌日には別人になる
 * - 保存するのはパス（クエリは UTM の 3 つだけ）、参照元のホスト名、端末の種別（mobile / desktop）だけ
 */

/** 流入元の分類。session の最初のページビューで決める */
export type Channel = "search" | "ai" | "social" | "ad" | "referral" | "direct" | "internal";

export const CHANNEL_LABELS: Record<Channel, string> = {
  search: "検索エンジン",
  ai: "生成 AI",
  social: "SNS",
  ad: "広告",
  referral: "他サイトからのリンク",
  direct: "直接（ブックマーク・URL 入力）",
  internal: "サイト内の移動",
};

/** タグが送ってくるイベントの種類 */
export type EventType = "pageview" | "leave" | "click" | "form";

/** click の種類（CV として数えるもの） */
export type ClickKind = "tel" | "mail" | "external";

export const CONVERSION_LABELS = {
  tel: "電話のタップ",
  mail: "メールのタップ",
  external: "外部サイト（予約など）への移動",
  form: "フォーム送信",
} as const;

export type ConversionKind = keyof typeof CONVERSION_LABELS;

/** データベースの 1 行（tracking_events） */
export interface TrackingRow {
  day: string;
  ts: string;
  visitor: string;
  type: EventType;
  path: string;
  referrer_host: string;
  channel: Channel;
  source: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  device: string;
  kind: string;
  seconds: number;
  scroll: number;
}

export interface Totals {
  visitors: number;
  sessions: number;
  pageviews: number;
  /** 滞在秒の平均（leave が届いたページのみ）。無ければ null */
  avgSeconds: number | null;
  /** 何らかの CV があったセッション数 */
  convertedSessions: number;
  conversions: Record<ConversionKind, number>;
  /** 生成 AI 経由のセッション数 */
  aiSessions: number;
}

export interface DailyPoint {
  day: string;
  visitors: number;
  sessions: number;
  pageviews: number;
  conversions: number;
}

export interface PageStat {
  path: string;
  pageviews: number;
  visitors: number;
  avgSeconds: number | null;
  conversions: number;
}

export interface ChannelStat {
  channel: Channel;
  sessions: number;
  share: number;
  conversions: number;
}

export interface SourceStat {
  /** サービス名（ChatGPT など）や参照元のホスト名 */
  name: string;
  sessions: number;
}

export interface AnalyticsReport {
  range: { from: string; to: string; days: number };
  previousRange: { from: string; to: string };
  totals: Totals;
  previous: Totals;
  daily: DailyPoint[];
  pages: PageStat[];
  channels: ChannelStat[];
  aiSources: SourceStat[];
  referrers: SourceStat[];
  devices: { mobile: number; desktop: number };
}

/** GET /api/analytics の応答 */
export interface AnalyticsPayload {
  site: {
    /** タグに埋め込む公開 ID */
    key: string;
    /** 貼り付け用の 1 行 */
    snippet: string;
    /** 最後にイベントが届いた時刻。まだ無ければ null */
    lastEventAt: string | null;
  };
  report: AnalyticsReport;
}
