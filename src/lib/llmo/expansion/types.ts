/**
 * プロンプト拡張（B7）の型とカテゴリ定義。
 * カテゴリは実装ガイド §16.1 の 8 つで固定（定義文もそのまま画面に出す）。
 */

export const PROMPT_CATEGORIES = [
  { name: "課題解決", definition: "困りごとや問題を解決する相手・方法を探しているプロンプト" },
  { name: "情報収集・定義", definition: "用語や仕組みを知りたいプロンプト" },
  { name: "比較・選定", definition: "複数の選択肢を比べて選びたいプロンプト" },
  { name: "手順・やり方", definition: "具体的な進め方・手順を知りたいプロンプト" },
  { name: "費用・料金", definition: "価格や費用対効果を知りたいプロンプト" },
  { name: "事例・実績", definition: "事例や実績を知りたいプロンプト" },
  { name: "指名", definition: "特定のブランド・サービス名を含むプロンプト" },
  { name: "最新動向", definition: "最新情報やトレンドを知りたいプロンプト" },
] as const;

export type PromptCategoryName = (typeof PROMPT_CATEGORIES)[number]["name"];

export const CATEGORY_NAMES: readonly PromptCategoryName[] = PROMPT_CATEGORIES.map((c) => c.name);

export function categoryDefinition(name: string): string {
  return PROMPT_CATEGORIES.find((c) => c.name === name)?.definition ?? "";
}

export function isCategoryName(value: unknown): value is PromptCategoryName {
  return typeof value === "string" && (CATEGORY_NAMES as readonly string[]).includes(value);
}

/** 生成された 1 本 */
export interface ExpandedPrompt {
  text: string;
  /** 全角も 1 文字として数えた文字数 */
  chars: number;
}

export interface ExpandedCategory {
  name: PromptCategoryName;
  definition: string;
  prompts: ExpandedPrompt[];
}

/** 対象サイトから取った文脈（LLM に渡す + 画面に「何を読んだか」を出す） */
export interface SiteContext {
  url: string;
  title: string | null;
  description: string | null;
  /** ナビゲーションのラベル */
  navLabels: string[];
  /** 主要見出し（h1 / h2） */
  headings: string[];
}

export interface ExpansionResult {
  seedPrompts: string[];
  siteUrl: string;
  site: SiteContext | null;
  /** サイトを読めなかったときの理由（読めなくても生成は続ける） */
  siteError: string | null;
  categories: ExpandedCategory[];
  total: number;
  requested: number;
  model: string;
  generatedAt: string;
}

/** 生成数の既定と上限 */
export const DEFAULT_COUNT = 50;
export const MAX_COUNT = 100;
export const MIN_COUNT = 10;
/** 参考プロンプトの上限 */
export const MAX_SEED_PROMPTS = 10;
