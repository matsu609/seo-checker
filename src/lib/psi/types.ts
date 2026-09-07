/**
 * PageSpeed Insights API v5 の結果のうち、レポートで使う部分だけを型にしたもの。
 * 生のレスポンスは巨大なので、パーサ（parse.ts）でここまで削ってから画面に渡す。
 */

export type PsiStrategy = "mobile" | "desktop";

/** Core Web Vitals の判定（Google の区分に合わせる） */
export type CruxCategory = "FAST" | "AVERAGE" | "SLOW" | "NONE";

export const CRUX_LABELS: Record<CruxCategory, string> = {
  FAST: "良好",
  AVERAGE: "改善が必要",
  SLOW: "不良",
  NONE: "データなし",
};

export interface CruxMetric {
  /** 実測値。LCP / INP はミリ秒、CLS は 0〜1 の値 */
  value: number;
  category: CruxCategory;
}

export interface PsiCategoryScores {
  /** 0〜100。取得できなければ null */
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
}

export interface PsiAudit {
  id: string;
  title: string;
  /** 0〜1 */
  score: number;
  /** 「1.2 秒」のような表示用の値 */
  displayValue: string;
  description: string;
}

export interface PsiResult {
  requestedUrl: string;
  finalUrl: string;
  strategy: PsiStrategy;
  fetchedAt: string;
  categories: PsiCategoryScores;
  /** CrUX の実測値（28 日間の実利用者データ）。無ければ null */
  crux: { lcp: CruxMetric | null; inp: CruxMetric | null; cls: CruxMetric | null } | null;
  /** Lighthouse のラボ値（この 1 回の計測） */
  lab: { lcp: number | null; cls: number | null; fcp: number | null; tbt: number | null };
  /** 改善余地の大きい項目（score < 0.9）の上位 */
  opportunities: PsiAudit[];
  /** API キーを使ったか（未使用だと呼び出し回数の上限が厳しい） */
  usedApiKey: boolean;
}
