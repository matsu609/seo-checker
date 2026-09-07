/**
 * AI ライティング・エディター（D1〜D4）の共通型。
 *
 * LLM に生成させる構造体のキーは、既存機能（ページ診断の DiagnosisAnalysis）に合わせて
 * snake_case の英語にする。画面のラベルだけ日本語にし、型の名前と表示を分ける。
 *
 * 生成物はすべてブラウザ（localStorage）に保存する。サーバーは状態を持たない。
 */

/* ───────────── D1 構成案 ───────────── */

/** 構成案の 1 見出し（h2 とその配下の h3） */
export interface OutlineSection {
  h2: string;
  h3: string[];
  /** この見出しで何を伝えるか（狙い） */
  goal: string;
  /** 想定文字数 */
  target_chars: number;
}

/** 構成案の本体（検索意図・読者像・トピック・見出し） */
export interface ArticleOutline {
  /** 検索意図 */
  search_intent: string;
  /** 読者像 */
  audience: string;
  /** 上位ページに共通するトピック */
  common_topics: string[];
  /** 上位ページに無い（狙える）トピック */
  missing_topics: string[];
  title_suggestions: string[];
  description_suggestions: string[];
  outline: OutlineSection[];
}

/** 上位ページの取得元。none は SERP を参照しなかったことを表す（推定でもダミーでもない） */
export type OutlineSerpSource = "serpapi" | "none";

export interface OutlineSerpEntry {
  position: number;
  title: string;
  url: string;
}

/** POST /api/writing/outline の応答 */
export interface OutlineResult {
  id: string;
  keyword: string;
  outline: ArticleOutline;
  serpSource: OutlineSerpSource;
  top10: OutlineSerpEntry[];
  /** 画面に出す注記（SERP を参照しなかった理由など） */
  notes: string[];
  model: string;
  createdAt: string;
}

/* ───────────── D2 企画書 ───────────── */

export interface PlanSection {
  h2: string;
  h3: string[];
  /** この見出しの要点 */
  points: string;
}

/** 企画書（ユーザーが編集してから執筆に渡す） */
export interface ArticlePlan {
  title_suggestions: string[];
  /** 想定読者 */
  audience: string;
  /** 記事の目的 */
  purpose: string;
  /** 対策キーワード */
  target_keywords: string[];
  /** 構成 */
  outline: PlanSection[];
  /** 参考情報（出典・ページ番号など） */
  references: string[];
  /** 注意点 */
  cautions: string[];
}

export interface PlanSource {
  url: string;
  title: string | null;
}

/** POST /api/writing/plan の応答 */
export interface PlanResult {
  id: string;
  plan: ArticlePlan;
  /** Web 検索を使ったときの引用元 */
  sources: PlanSource[];
  /** LLM が内部で発行した検索クエリ */
  searchQueries: string[];
  notes: string[];
  model: string;
  createdAt: string;
}

/* ───────────── D1 本文生成のストリーム ───────────── */

/** 文体。desu = ですます調 / dearu = だ・である調 */
export type WritingTone = "desu" | "dearu";

export type BodyStreamEvent =
  | { type: "section-start"; index: number; total: number; h2: string }
  | { type: "delta"; index: number; text: string }
  | { type: "section-end"; index: number; markdown: string }
  | { type: "done"; sections: number; chars: number }
  | { type: "error"; error: string };

/* ───────────── D3 エディター ───────────── */

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffPart {
  op: DiffOp;
  text: string;
}

/** リライトのストリーム（本文生成と分けて単純にする） */
export type RewriteStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" }
  | { type: "error"; error: string };

/* ───────────── D4 チェック ───────────── */

export type CheckKind = "fact" | "copy" | "yakki";

/** 指摘の重さ。UI の StatusTone に合わせる */
export type IssueSeverity = "fail" | "warn" | "info" | "pass";

export interface CheckSource {
  url: string;
  title: string | null;
}

/** 1 件の指摘。span が本文中に見つかればエディターで強調表示する */
export interface CheckIssue {
  id: string;
  kind: CheckKind;
  /** 本文中の該当箇所（そのままの文字列） */
  text: string;
  /** 本文中の開始位置。見つからなければ null */
  start: number | null;
  severity: IssueSeverity;
  /** 判定ラベル（裏付けあり / 矛盾 / 不明 / 一致 など） */
  verdict: string;
  message: string;
  /** 言い換え候補・修正案 */
  suggestion?: string;
  sources: CheckSource[];
}

export interface CheckResult {
  kind: CheckKind;
  issues: CheckIssue[];
  /** 検査した件数（主張の数・サンプル文の数・走査した文字数など） */
  checked: number;
  notes: string[];
  model: string | null;
  createdAt: string;
}
