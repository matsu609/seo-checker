/**
 * 診断結果の型定義。
 *
 * - `pass`  … 条件を満たしている（配点分を獲得）
 * - `warn`  … 改善余地あり（配点の半分を獲得）
 * - `fail`  … 未対応（0点）
 * - `info`  … 任意項目。スコアには影響しない（設定があれば pass に変わる）
 */
export type CheckStatus = "pass" | "warn" | "fail" | "info";

export type CategoryId =
  | "crawlers"
  | "structuredData"
  | "meta"
  | "headings"
  | "content";

export interface CheckResult {
  id: string;
  category: CategoryId;
  status: CheckStatus;
  /** 画面に出す一行ラベル（状態に応じて文言が変わる） */
  label: string;
  /** 判定根拠（例: "h1 が 2 個あります"） */
  evidence?: string;
  /** なぜ必要か・どう直すか。pass 以外のときに表示 */
  advice?: string;
  /** 配点。info のときは 0 */
  weight: number;
  /** 獲得点（weight * 0 / 0.5 / 1） */
  earned: number;
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  score: number; // 0-100
  checks: CheckResult[];
}

export interface PageSnapshot {
  url: string;
  finalUrl: string;
  status: number;
  title: string | null;
  description: string | null;
  lang: string | null;
  /** 本文テキスト（ナビ・フッター除去済み。FAQ生成にも使う） */
  mainText: string;
  mainTextLength: number;
  /** ページ全体のテキスト長（比較用） */
  rawTextLength: number;
  jsonLdTypes: string[];
  h1Count: number;
  fetchedAt: string;
}

export interface AnalysisResult {
  page: PageSnapshot;
  overall: number;
  categories: CategoryScore[];
  /** 診断中に起きた非致命的な問題 */
  notes: string[];
}

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  crawlers: "AIクローラ可否",
  structuredData: "構造化データ",
  meta: "メタ情報",
  headings: "見出し",
  content: "コンテンツ",
};

/** 総合スコアを出すときのカテゴリ重み */
export const CATEGORY_WEIGHTS: Record<CategoryId, number> = {
  crawlers: 20,
  structuredData: 25,
  meta: 20,
  headings: 15,
  content: 20,
};

// ---------------------------------------------------------------------------
// サイト単位の診断
//
// analyze() は 1 ページだけを見るため、トップと下層ページでスコアが変わる。
// これは仕様だが、「サイトとしてどうなのか」「どのページが足を引っ張っているのか」
// を知りたい場面では役に立たない。以下の型はその集計結果を表す。
// ---------------------------------------------------------------------------

/** ページごとの診断結果（サイト診断の 1 行分） */
export interface SitePageResult {
  url: string;
  overall: number;
  /** カテゴリ ID → スコア */
  scores: Record<CategoryId, number>;
  page: PageSnapshot;
}

/** 診断できなかったページ */
export interface SitePageFailure {
  url: string;
  message: string;
}

/** カテゴリごとの、ページ横断の集計 */
export interface SiteCategoryScore {
  id: CategoryId;
  label: string;
  /** 全ページの平均 */
  score: number;
  min: number;
  max: number;
  /** 最低点のページ */
  worstUrl: string;
}

/**
 * 診断項目ごとの、ページ横断の集計。
 * `spread` が "uniform" ならサイト全体の問題（テンプレートを 1 箇所直せば全ページ直る）、
 * "mixed" なら特定ページだけの問題。ページ間でスコアが変わる理由はここに出る。
 */
export interface SiteCheckSummary {
  id: string;
  category: CategoryId;
  label: string;
  advice?: string;
  /** 状態ごとのページ数 */
  counts: Record<CheckStatus, number>;
  spread: "uniform" | "mixed";
  /** pass 以外だったページ */
  affected: { url: string; status: CheckStatus; evidence?: string }[];
}

export interface SiteAnalysisResult {
  /** 入力された URL */
  entryUrl: string;
  origin: string;
  /** 実際に診断したページ（入力 URL を先頭に含む） */
  pages: SitePageResult[];
  failures: SitePageFailure[];
  /** 全ページの総合スコアの平均 */
  overall: number;
  categories: SiteCategoryScore[];
  /** ページ間でばらついた項目を先頭にした一覧 */
  checks: SiteCheckSummary[];
  /** URL をどうやって集めたか */
  discovery: "sitemap" | "links" | "entry-only";
  notes: string[];
  fetchedAt: string;
}
