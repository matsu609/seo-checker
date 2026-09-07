/**
 * プロバイダ共通のインターフェース。
 * 実装は 1 ファイル 1 プロバイダ（claude / openai / gemini / perplexity）。
 */
import type { ProviderAnswer, ProviderCitation, ProviderResult } from "../types";
import type { ProviderId, ProviderMeta } from "./meta";

export interface AskOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** 呼び出し前に判定できる部分（回答本文・引用・検索クエリ） */
export interface ParsedAnswer {
  answer: string;
  citations: ProviderCitation[];
  searchQueries: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface Provider {
  id: ProviderId;
  label: string;
  meta: ProviderMeta;
  /** 実際に使うモデル ID（環境変数で差し替え可能） */
  model(): string;
  /** API キーが設定されているか */
  enabled(): boolean;
  /**
   * プロンプトを投げて回答・引用・検索クエリを受け取る。
   * 例外はモジュール外に投げない（必ず ProviderFailure を返す）。
   */
  ask(prompt: string, options?: AskOptions): Promise<ProviderResult>;
}

/** 引用の重複除去（クエリ・フラグメントを無視して同一 URL を 1 件にする） */
export function dedupeCitations(citations: readonly ProviderCitation[]): ProviderCitation[] {
  const out: ProviderCitation[] = [];
  const seen = new Set<string>();
  for (const c of citations) {
    const url = typeof c.url === "string" ? c.url.trim() : "";
    if (!url) continue;
    const key = url.replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url, title: c.title && c.title.trim() ? c.title.trim() : null });
  }
  return out;
}

/** 検索クエリの重複除去（前後の空白を落とし、順序は維持） */
export function dedupeQueries(queries: readonly string[]): string[] {
  const out: string[] = [];
  for (const q of queries) {
    const text = typeof q === "string" ? q.trim() : "";
    if (!text || out.includes(text)) continue;
    out.push(text);
  }
  return out;
}

/** ParsedAnswer → 成功結果 */
export function toAnswer(providerId: ProviderId, model: string, parsed: ParsedAnswer): ProviderAnswer {
  return {
    ok: true,
    providerId,
    model,
    answer: parsed.answer,
    citations: dedupeCitations(parsed.citations),
    searchQueries: dedupeQueries(parsed.searchQueries),
    ...(parsed.usage ? { usage: parsed.usage } : {}),
  };
}
