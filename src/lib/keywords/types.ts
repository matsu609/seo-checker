/**
 * キーワード調査（C1）の型。
 *
 * サーバーは「キーワードの一覧 + 出所 + 検索意図」だけを返し、
 * 履歴の保存はブラウザ側（store.ts）が行う。
 */

/** どこから拾ってきたキーワードか */
export type KeywordSource = "suggest" | "related" | "paa";

export const SOURCE_LABELS: Record<KeywordSource, string> = {
  suggest: "サジェスト",
  related: "関連",
  paa: "PAA",
};

/** 検索意図の 4 区分（実装ガイド §8.3） */
export type SearchIntent = "informational" | "navigational" | "transactional" | "commercial";

export const INTENTS: readonly SearchIntent[] = [
  "informational",
  "commercial",
  "transactional",
  "navigational",
];

export const INTENT_LABELS: Record<SearchIntent, string> = {
  informational: "情報収集",
  navigational: "サイト誘導",
  transactional: "取引",
  commercial: "商業調査",
};

export const INTENT_DESCRIPTIONS: Record<SearchIntent, string> = {
  informational: "知りたい・調べたい（とは / 方法 / やり方）",
  navigational: "特定のサイト・ブランドへ行きたい（公式 / ログイン）",
  transactional: "買いたい・申し込みたい（購入 / 料金 / 申込）",
  commercial: "買う前に比べたい（比較 / おすすめ / ランキング）",
};

/** 意図を誰が付けたか。「不明」を隠さないために持つ */
export type IntentJudge = "rule" | "llm" | "unknown";

export const JUDGE_LABELS: Record<IntentJudge, string> = {
  rule: "ルール",
  llm: "AI 分類",
  unknown: "未分類",
};

export interface KeywordRow {
  keyword: string;
  /** 空白・記号を含めた見た目の文字数 */
  chars: number;
  /** 出所（複数の経路で見つかることがある） */
  sources: KeywordSource[];
  intent: SearchIntent | null;
  judge: IntentJudge;
  /** ルール分類の根拠（一致した語） */
  matched?: string;
}

/** 処理の中で起きた「できなかったこと」。画面にそのまま出す */
export interface KeywordNote {
  kind: "suggest_partial" | "related_skipped" | "intent_skipped" | "capped";
  message: string;
}

export interface KeywordsResponse {
  seed: string;
  rows: KeywordRow[];
  /** サジェスト展開の内訳 */
  suggest: {
    /** 投げたクエリ数 */
    queries: number;
    /** 成功したクエリ数 */
    succeeded: number;
    /** 取得できたキーワード数（重複除去後） */
    keywords: number;
  };
  related: {
    /** SERP プロバイダが設定されているか */
    enabled: boolean;
    relatedSearches: number;
    relatedQuestions: number;
  };
  intent: {
    /** ANTHROPIC_API_KEY があるか */
    llmEnabled: boolean;
    ruleCount: number;
    llmCount: number;
    unknownCount: number;
  };
  notes: KeywordNote[];
  fetchedAt: string;
}
