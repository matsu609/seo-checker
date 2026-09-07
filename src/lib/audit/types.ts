/**
 * A1 サイト診断（テクニカル SEO）の型。
 *
 * カテゴリは docs/reference/04_implementation-guide.md §1.2 の 10 種に合わせる
 * （yoriai の画面と同じ並び）。ルールはこの型の Issue を返す純関数として書き、
 * ページ単位（rules/page.ts）とサイト横断（rules/cross.ts）に分ける。
 */
import type { SiteFiles } from "@/lib/analyzer/robots";

/** 課題のカテゴリ。画面のカテゴリ表・フィルタはこの順に並べる */
export const AUDIT_CATEGORIES = [
  "タイトルタグ",
  "メタタグ",
  "コンテンツ",
  "見出しタグ",
  "画像",
  "カノニカルタグ",
  "基本的な設定",
  "セキュリティ",
  "パフォーマンス",
  "構造",
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/** error = 直すべき / warning = 直したほうがよい / info = 把握しておく */
export type Severity = "error" | "warning" | "info";

export const SEVERITY_LABELS: Record<Severity, string> = {
  error: "重大",
  warning: "警告",
  info: "情報",
};

export interface Issue {
  ruleId: string;
  category: AuditCategory;
  severity: Severity;
  /** 対象 URL。サイト単位のルールはオリジンを入れる */
  url: string;
  /** 判定根拠（画面にそのまま出す 1 行） */
  detail: string;
  /** どう直すか */
  suggestion: string;
}

/** 見出し 1 つ */
export interface HeadingNode {
  level: number;
  text: string;
}

/** JSON-LD の抽出結果（構造化データのルール用） */
export interface JsonLdInfo {
  blocks: number;
  parseErrors: number;
  /** @type を持たないブロック数 */
  withoutType: number;
  types: string[];
}

/**
 * 1 ページ分の解析結果。ルールはこれだけを見る（DOM を再パースしない）。
 * ネットワークに依存する値（loadMs / 検証済みステータス）は収集側が埋める。
 */
export interface AuditPage {
  /** 待ち行列に入っていた URL（正規化済み） */
  url: string;
  /** リダイレクト後の URL */
  finalUrl: string;
  status: number;
  /** 入力 URL からの内部リンクの最短ホップ数。到達できなければ null */
  depth: number | null;
  contentType: string;
  /** HTML のバイト数（Content-Length が無ければ本文から概算） */
  bytes: number;
  contentEncoding: string | null;
  /** 実測した取得時間（ミリ秒）。計測対象外のページは null */
  loadMs: number | null;

  title: string | null;
  /** 全角換算の文字数 */
  titleWidth: number;
  description: string | null;
  descriptionWidth: number;
  lang: string | null;

  canonical: string | null;
  canonicalCount: number;
  ogUrl: string | null;

  metaRobots: string;
  xRobotsTag: string;
  hasViewport: boolean;
  hasFaviconLink: boolean;
  metaRefresh: string | null;

  iframes: number;
  deprecatedTags: string[];

  headings: HeadingNode[];
  h1: string[];
  /** h2 → h4 のように 1 段以上飛んだ箇所の数 */
  headingSkips: number;

  /** 本文（Readability）の文字数 */
  mainTextLength: number;
  /** HTML 全体のテキスト文字数 */
  rawTextLength: number;
  htmlLength: number;
  /** テキスト / HTML の比（0〜1） */
  textRatio: number;
  /** 本文の指紋（重複判定用） */
  contentHash: string;

  images: number;
  imagesWithoutAlt: number;
  imagesWithoutTitle: number;

  /** 同一オリジンのリンク先（正規化済み・重複なし） */
  internalLinks: string[];
  externalLinks: string[];
  /** https ページ内の http リソース */
  mixedContent: string[];

  jsonLd: JsonLdInfo;
  /** robots.txt が Googlebot にこの URL を許可しているか */
  robotsAllowed: boolean;
}

/** 検証のために追加で取得した URL の結果 */
export interface ProbeResult {
  status: number;
  finalUrl: string;
  /** リダイレクトのホップ数（1 = 単発、2 = 2 ホップ以上を確認） */
  hops: number;
}

/** ルールがページ以外に参照するサイト全体の情報 */
export interface AuditContext {
  origin: string;
  entryUrl: string;
  siteFiles: SiteFiles;
  /** robots.txt が読めたか */
  robotsExists: boolean;
  /** サイトマップから集めた URL（正規化済み） */
  sitemapUrls: string[];
  /** サイトマップファイルを 1 つでも読めたか */
  sitemapFound: boolean;
  /** /favicon.ico が 200 で返るか */
  faviconExists: boolean;
  /** http:// のトップが https へ転送されずに 200 を返すか */
  httpServed: boolean;
  /** クロール外の URL を検証した結果（リンク切れ・canonical 先の確認） */
  probes: Record<string, ProbeResult>;
  /** 本文の MinHash 署名（URL → 署名）。重複判定にだけ使う */
  signatures: Record<string, number[]>;
}

export type PageRule = (page: AuditPage, context: AuditContext) => Issue[];
export type CrossRule = (pages: readonly AuditPage[], context: AuditContext) => Issue[];

/** カテゴリごとの件数（前回比つき） */
export interface CategoryCount {
  category: AuditCategory;
  count: number;
  /** 前回の件数。履歴が無ければ undefined */
  prevCount?: number;
  delta?: number;
}

/** クロールの統計（画面の KPI に出す） */
export interface AuditCrawlStats {
  discovered: number;
  fetched: number;
  analyzed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  maxPages: number;
  truncated: { reason: "max-pages" | "time-budget"; limit: number } | null;
  sitemapCount: number;
  linkCount: number;
  /** 追加で検証した URL 数（リンク切れ確認など） */
  probed: number;
  /** 取得時間を実測したページ数 */
  timed: number;
}

/** 表に出すページ 1 行分（結果 JSON を軽くするため本文などは持たない） */
export interface AuditPageRow {
  url: string;
  finalUrl: string;
  status: number;
  depth: number | null;
  title: string | null;
  description: string | null;
  h1Count: number;
  mainTextLength: number;
  textRatio: number;
  bytes: number;
  loadMs: number | null;
  internalLinks: number;
  inlinks: number;
  canonical: string | null;
  noindex: boolean;
  issues: number;
}

export interface AuditFailure {
  url: string;
  message: string;
}

export interface AuditSummary {
  /** 全体評価 */
  overall: string;
  /** 技術的な健全性 */
  technicalHealth: string[];
  /** コンテンツの問題点 */
  contentIssues: string[];
  /** 優先対応 */
  priorityActions: { title: string; why: string; rules: string[] }[];
  /** "rule" = ルールから組み立てた文章 / "llm" = Claude が生成 */
  source: "rule" | "llm";
}

export interface AuditResult {
  startUrl: string;
  origin: string;
  crawledAt: string;
  crawl: AuditCrawlStats;
  pages: AuditPageRow[];
  issues: Issue[];
  byCategory: CategoryCount[];
  /** 重要度ごとの件数 */
  bySeverity: Record<Severity, number>;
  /** ルールごとの件数（多い順） */
  byRule: { ruleId: string; category: AuditCategory; severity: Severity; count: number }[];
  failures: AuditFailure[];
  notes: string[];
  summary?: AuditSummary;
}

/** POST /api/site-audit が NDJSON で流すイベント。1 行 1 オブジェクト */
export type AuditStreamEvent =
  | { type: "progress"; phase: AuditPhase; fetched: number; queued: number; discovered: number; analyzed: number; failed: number; url?: string; elapsedMs: number }
  | { type: "result"; result: AuditResult; cached: boolean }
  | { type: "error"; error: string; code?: string };

/** 進捗の段階 */
export type AuditPhase = "discover" | "crawl" | "verify" | "analyze";

/** 進捗の 1 通知分。クライアントからも型だけ参照する */
export interface AuditProgress {
  phase: AuditPhase;
  fetched: number;
  queued: number;
  discovered: number;
  analyzed: number;
  failed: number;
  url?: string;
  elapsedMs: number;
}

export const PHASE_LABELS: Record<AuditPhase, string> = {
  discover: "サイトマップと内部リンクからページを収集しています",
  crawl: "ページを取得して解析しています",
  verify: "リンク先とリダイレクトを検証しています",
  analyze: "サイト横断のチェックを実行しています",
};
