/**
 * 生成 AI 流入分析（B6）の共通型。
 * サーバー（/api/ai-traffic）とクライアント（画面・集計）の両方から参照する。
 */
import type { AiSourceEntry } from "@/lib/ga4/ai-sources";

/** 比較単位（docs/reference/04_implementation-guide.md §19） */
export type Granularity = "day" | "week" | "month";

export const GRANULARITY_LABELS: Record<Granularity, string> = {
  day: "日",
  week: "週",
  month: "月",
};

/** 指標切替。GA4 の sessions / totalUsers に対応 */
export type TrafficMetric = "sessions" | "users";

/**
 * 指標のラベル。
 *
 * users を「延べ」と書いているのは、参照元やチャネルごとに重複が除かれた
 * GA4 の totalUsers を足し合わせているため。同じ人が複数の参照元から来ると
 * その回数だけ数えられるので、実ユーザー数より多くなる。
 */
export const METRIC_LABELS: Record<TrafficMetric, string> = {
  sessions: "セッション数",
  users: "ユーザー数（延べ）",
};

/** GA4 のチャネルグループ名（自然検索の判定に使う） */
export const ORGANIC_SEARCH_CHANNEL = "Organic Search";

/** 列に出せるキーイベント名の数（GA4 のメトリクス数を増やしすぎないため） */
export const MAX_KEY_EVENT_NAMES = 5;

/**
 * GA4 のイベント名として使える文字だけ通す。
 * メトリクス名（keyEvents:<name>）に埋め込むので、画面の入力チェックと
 * サーバー側の絞り込みで同じ判定を使う。
 */
export function isValidEventName(name: string): boolean {
  return /^[A-Za-z0-9_]{1,40}$/.test(name);
}

/** POST /api/ai-traffic のリクエスト */
export interface AiTrafficRequest {
  /** 省略時は GA4_PROPERTY_ID。同じサービスアカウントで見える別プロパティを指定できる */
  propertyId?: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
  /**
   * 比較単位。バケット分けは画面側（aggregateTraffic）で行うため取得内容は変わらないが、
   * 仕様どおりのリクエストをそのまま送れるように受け付ける。
   */
  granularity?: Granularity;
  /** キャッシュを使わずに取り直す */
  refresh?: boolean;
  /** ユーザーが追加した参照元辞書 */
  extraSources?: AiSourceEntry[];
  /** 列に出すキーイベント名（GA4 の keyEvents:<name>） */
  keyEventNames?: string[];
}

/** 日 × 参照元 × チャネルの 1 行（集計前の素データ） */
export interface AiTrafficDailyRow {
  /** YYYY-MM-DD */
  date: string;
  /** GA4 の sessionSource */
  source: string;
  /** GA4 の sessionDefaultChannelGroup */
  channel: string;
  sessions: number;
  users: number;
}

/** ランディングページ × 参照元の 1 行 */
export interface AiTrafficPageRow {
  landingPage: string;
  source: string;
  /** 辞書で判定したサービス名。判定できなければ null */
  service: string | null;
  sessions: number;
  users: number;
  /** キーイベント合計 */
  keyEvents: number;
  /** キーイベント名ごとの件数（リクエストで指定した名前だけ） */
  keyEventsByName: Record<string, number>;
}

/** POST /api/ai-traffic のレスポンス */
export interface AiTrafficResponse {
  range: { startDate: string; endDate: string };
  daily: AiTrafficDailyRow[];
  pages: AiTrafficPageRow[];
  /** 実際に取得したキーイベント名 */
  keyEventNames: string[];
  fetchedAt: string;
  /** GA4 の取得上限に達して打ち切った */
  truncated: boolean;
}
