/**
 * CrUX（Chrome UX Report）API の型。実ユーザーの Field Data（28 日間の集計）。
 * サイトの所有権も Google 連携も不要で、API キーだけで誰のサイトでも引ける。
 */

export type CruxMetricId = "lcp" | "inp" | "cls" | "fcp" | "ttfb";

export const CRUX_METRIC_LABELS: Record<CruxMetricId, string> = {
  lcp: "LCP（主要コンテンツの表示）",
  inp: "INP（操作への応答）",
  cls: "CLS（レイアウトのずれ）",
  fcp: "FCP（最初の描画）",
  ttfb: "TTFB（サーバー応答）",
};

/** Google の区分（75 パーセンタイルで判定） */
export type CruxStatus = "good" | "needs-improvement" | "poor";

export const CRUX_STATUS_LABELS: Record<CruxStatus, string> = {
  good: "良好",
  "needs-improvement": "改善が必要",
  poor: "不良",
};

/** 良好 / 不良の境界（LCP・INP・FCP・TTFB はミリ秒、CLS は比率） */
export const CRUX_THRESHOLDS: Record<CruxMetricId, { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
};

export interface CruxMetricValue {
  /** 75 パーセンタイル */
  p75: number;
  status: CruxStatus;
  /** 良好 / 改善が必要 / 不良 の利用者の割合（0〜1） */
  histogram: [number, number, number];
}

export interface CruxRecord {
  /** "url" か "origin"（どちらの単位のデータか。画面に必ず出す） */
  scope: "url" | "origin";
  key: string;
  /** 集計期間 */
  period: { firstDate: string; lastDate: string };
  metrics: Partial<Record<CruxMetricId, CruxMetricValue>>;
  /** LCP・INP・CLS がそろって良好なら true。1 つでも無ければ null */
  passesCoreWebVitals: boolean | null;
}

export interface CruxHistoryPoint {
  /** 集計期間の終了日 */
  date: string;
  p75: number | null;
}

export interface CruxHistory {
  scope: "url" | "origin";
  key: string;
  metrics: Partial<Record<CruxMetricId, CruxHistoryPoint[]>>;
}

/** 取得できなかった理由。"no-data" はデータ不足（Chrome ユーザーが足りない） */
export type CruxFailure = "no-data" | "no-key" | "network" | "upstream";

export interface CruxOutcome<T> {
  result: T | null;
  failure: CruxFailure | null;
  message: string | null;
}
