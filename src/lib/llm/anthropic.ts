/**
 * Anthropic クライアントの共通部品（サーバー専用）。
 * 各機能はここから client / モデル / エラー変換を使い、SDK を直接触らない。
 */
import Anthropic from "@anthropic-ai/sdk";

/** モデル ID は日付サフィックス無しで書く */
export const MODELS = {
  /** 分析・生成（既定 claude-opus-5） */
  default: process.env.LLM_MODEL?.trim() || "claude-opus-5",
  /** 分類・判定など大量処理（既定 claude-haiku-4-5） */
  fast: process.env.LLM_FAST_MODEL?.trim() || "claude-haiku-4-5",
  /** 既存の FAQ 生成（既定 claude-haiku-4-5） */
  faq: process.env.FAQ_MODEL?.trim() || "claude-haiku-4-5",
} as const;

export type ModelKind = keyof typeof MODELS;

export function isAnthropicEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

let client: Anthropic | null = null;

/** 遅延生成のシングルトン。キーが無ければ例外（呼ぶ前に isAnthropicEnabled を見る） */
export function getAnthropicClient(): Anthropic {
  if (!isAnthropicEnabled()) {
    throw new Error("ANTHROPIC_API_KEY が設定されていません");
  }
  if (!client) client = new Anthropic({ maxRetries: 2 });
  return client;
}

/**
 * サーバーツールの Web 検索。`tools` に渡すだけで Claude が検索して引用付きで答える。
 * 回答中の `server_tool_use`（input.query）がファンアウトクエリ、
 * `web_search_tool_result` と text の `citations` が引用元。
 */
export const WEB_SEARCH_TOOL: Anthropic.Messages.WebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 5,
};

/** 日本向けに位置情報や回数を変えた Web 検索ツール */
export function webSearchTool(
  options: { maxUses?: number; allowedDomains?: string[]; blockedDomains?: string[]; japan?: boolean } = {},
): Anthropic.Messages.WebSearchTool20260209 {
  const tool: Anthropic.Messages.WebSearchTool20260209 = {
    ...WEB_SEARCH_TOOL,
    max_uses: options.maxUses ?? WEB_SEARCH_TOOL.max_uses,
  };
  if (options.allowedDomains?.length) tool.allowed_domains = options.allowedDomains;
  else if (options.blockedDomains?.length) tool.blocked_domains = options.blockedDomains;
  if (options.japan !== false) {
    tool.user_location = { type: "approximate", country: "JP", timezone: "Asia/Tokyo" };
  }
  return tool;
}

export interface ApiErrorInfo {
  status: number;
  message: string;
  /** 再試行で直る可能性があるか */
  retryable: boolean;
}

/**
 * SDK の例外 → HTTP ステータスと日本語メッセージ。Route Handler はこれをそのまま返す。
 * （src/app/api/faq/route.ts と同じ対応表）
 */
export function toApiError(err: unknown): ApiErrorInfo {
  if (err instanceof Anthropic.AuthenticationError) {
    return { status: 503, message: "ANTHROPIC_API_KEY が無効です", retryable: false };
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return { status: 503, message: "この API キーではこのモデルを利用できません", retryable: false };
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: "AI の利用上限に達しました。しばらく待って再試行してください", retryable: true };
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return { status: 504, message: "AI の応答がタイムアウトしました。もう一度お試しください", retryable: true };
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: "AI に接続できませんでした", retryable: true };
  }
  if (err instanceof Anthropic.BadRequestError) {
    console.error("[llm] bad request", err.status, err.message);
    return { status: 502, message: "AI への要求が不正でした（入力が長すぎる可能性があります）", retryable: false };
  }
  if (err instanceof Anthropic.APIError) {
    console.error("[llm] api error", err.status, err.message);
    return { status: 502, message: "AI との通信に失敗しました", retryable: (err.status ?? 500) >= 500 };
  }
  if (err instanceof StructuredOutputError) {
    return { status: 502, message: err.message, retryable: true };
  }
  if (err instanceof Error && /ANTHROPIC_API_KEY/.test(err.message)) {
    return { status: 503, message: "AI 機能は無効です。サーバーに ANTHROPIC_API_KEY を設定してください", retryable: false };
  }
  console.error("[llm] unexpected error", err);
  return { status: 500, message: "AI の処理中にエラーが発生しました", retryable: false };
}

/** 構造化出力を解釈できなかったとき（structured.ts が投げる） */
export class StructuredOutputError extends Error {
  constructor(message = "AI の出力を解釈できませんでした") {
    super(message);
    this.name = "StructuredOutputError";
  }
}

/* ───────────── 回答からの取り出し（型が追い付いていなくても落ちないよう unknown で読む） ───────────── */

export interface Citation {
  url: string;
  title: string | null;
  /** 引用された本文（citations にだけある） */
  citedText?: string;
  /** 取得日など（検索結果にだけある） */
  pageAge?: string | null;
}

type Blocks = { content?: unknown } | null | undefined;

function blocksOf(message: Blocks): Record<string, unknown>[] {
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter((b): b is Record<string, unknown> => Boolean(b) && typeof b === "object");
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function pushUnique(out: Citation[], seen: Set<string>, c: Citation): void {
  const key = c.url.replace(/[#?].*$/, "").replace(/\/$/, "");
  if (seen.has(key)) return;
  seen.add(key);
  out.push(c);
}

/**
 * 本文の `citations`（web_search_result_location）から引用元を集める。
 * 実際に回答文の根拠として使われた URL だけ（検索したが使わなかったものは含まない）。
 */
export function extractCitations(message: Blocks): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const block of blocksOf(message)) {
    if (block.type !== "text" || !Array.isArray(block.citations)) continue;
    for (const c of block.citations as unknown[]) {
      if (!c || typeof c !== "object") continue;
      const cit = c as Record<string, unknown>;
      const url = str(cit.url);
      if (!url) continue;
      pushUnique(out, seen, { url, title: str(cit.title), citedText: str(cit.cited_text) ?? undefined });
    }
  }
  return out;
}

/**
 * `web_search_tool_result` に入っている検索結果（見つかった URL 全部）。
 * エラー結果（web_search_tool_result_error）は読み飛ばす。
 */
export function extractSearchResults(message: Blocks): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  for (const block of blocksOf(message)) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const r of block.content as unknown[]) {
      if (!r || typeof r !== "object") continue;
      const res = r as Record<string, unknown>;
      if (res.type !== "web_search_result") continue;
      const url = str(res.url);
      if (!url) continue;
      pushUnique(out, seen, { url, title: str(res.title), pageAge: str(res.page_age) });
    }
  }
  return out;
}

/** `server_tool_use`（web_search）の input.query = LLM が内部で発行した検索クエリ（ファンアウト） */
export function extractSearchQueries(message: Blocks): string[] {
  const out: string[] = [];
  for (const block of blocksOf(message)) {
    if (block.type !== "server_tool_use" || block.name !== "web_search") continue;
    const input = block.input;
    if (!input || typeof input !== "object") continue;
    const q = str((input as Record<string, unknown>).query);
    if (q && !out.includes(q)) out.push(q);
  }
  return out;
}

/** text ブロックを連結した本文 */
export function extractText(message: Blocks): string {
  return blocksOf(message)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}
