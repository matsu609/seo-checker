/**
 * ページ診断（A4: キーワード × ページ）の共通型。
 *
 * SERP は SERPAPI_KEY があれば実測、無ければ Claude の Web 検索で「推定」する。
 * 推定かどうかは `serpSource` で区別し、画面では必ず「推定」と明示する
 * （実測値として見せないため、型の段階で情報を落とさない）。
 */
import type { SerpFeature, SerpRelatedQuestion } from "@/lib/serp/types";

/** Top10 の取得元。web_search は Claude の Web 検索による推定 */
export type SerpSource = "serpapi" | "web_search";

export type DiagnosisDevice = "desktop" | "mobile";

export interface DiagnosisHeading {
  /** 1〜3（h1〜h3 のみ保持する） */
  level: number;
  text: string;
}

/** 1 ページを取得して測った素の値 */
export interface PageMeasurement {
  /** 指定された URL（リダイレクトされても残す） */
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  /** 本文の文字数（空白・記号を除く。analyzer の countChars と同じ数え方） */
  charCount: number;
  images: number;
  headings: DiagnosisHeading[];
  h1: string[];
  internalLinks: number;
  externalLinks: number;
  /** 取得にかかった時間（ミリ秒） */
  fetchMs: number;
  /** 構造化データの @type（重複なし） */
  jsonLdTypes: string[];
  /** 公開日 / 更新日（取れたときだけ。ISO 文字列または元の表記） */
  publishedAt: string | null;
  modifiedAt: string | null;
  /** LLM に渡す本文（呼び出し側で切り詰める） */
  mainText: string;
}

/** SERP の 1 件（実測でも推定でも同じ形） */
export interface SerpEntry {
  position: number;
  title: string;
  url: string;
  snippet?: string;
}

/** Top10 の 1 ページ（SERP の情報 + 実測値）。measurement が null なら取得に失敗した */
export interface CompetitorPage {
  position: number;
  title: string;
  url: string;
  snippet?: string;
  measurement: PageMeasurement | null;
}

/** 取得できなかったページ（理由を画面に出す） */
export interface PageFailure {
  url: string;
  position: number | null;
  reason: string;
}

/** 1 指標の Top10 統計と自社との差分 */
export interface MetricStats {
  /** 統計に使えた件数 */
  count: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  /** 自社ページの値（未取得なら null） */
  self: number | null;
  /** 自社 − Top10 平均（どちらかが無ければ null） */
  gap: number | null;
  /** 自社 ÷ Top10 平均（平均が 0 のときは null） */
  ratio: number | null;
}

export interface DiagnosisStats {
  charCount: MetricStats;
  images: MetricStats;
  internalLinks: MetricStats;
  externalLinks: MetricStats;
  fetchMs: MetricStats;
  headings: MetricStats;
}

export interface TechnicalIssue {
  issue: string;
  fix: string;
}

/** yoriai の「追加を推奨する箇所 / 追加するコンテンツの概要 / 提案理由」 */
export interface ContentProposal {
  location: string;
  outline: string;
  reason: string;
}

export interface DiagnosisAnalysis {
  summary: string;
  title_suggestions: string[];
  description_suggestions: string[];
  search_intent: string;
  serp_trend: string;
  technical_issues: TechnicalIssue[];
  content_proposals: ContentProposal[];
}

/** 対象ページの決まり方 */
export type TargetOrigin = "input" | "serp" | "none";

export interface DiagnosisResult {
  /** keyword + url から作る安定 ID（保存のキー） */
  id: string;
  keyword: string;
  device: DiagnosisDevice;
  location?: string;
  /** 自社ドメイン（SERP から対策ページを拾うときに使う） */
  projectDomain?: string;
  targetUrl: string | null;
  targetOrigin: TargetOrigin;
  serpSource: SerpSource;
  top10: SerpEntry[];
  features: SerpFeature[];
  relatedQuestions: SerpRelatedQuestion[];
  aiOverviewPresent: boolean;
  self: PageMeasurement | null;
  competitors: CompetitorPage[];
  failures: PageFailure[];
  stats: DiagnosisStats;
  analysis: DiagnosisAnalysis | null;
  /** 分析に使ったモデル（未実施なら null） */
  model: string | null;
  /** 分析できなかった理由（AI 未設定など）。画面に出す */
  notes: string[];
  createdAt: string;
}

/** POST /api/page-diagnosis のリクエスト */
export interface DiagnosisRequest {
  keyword: string;
  url?: string;
  device?: DiagnosisDevice;
  location?: string;
  projectDomain?: string;
}

/** チャット 1 往復 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** POST /api/page-diagnosis/chat の NDJSON 行 */
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };
