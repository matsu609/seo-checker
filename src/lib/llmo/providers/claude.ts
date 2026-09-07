/**
 * Claude（Anthropic Messages API + サーバーツール web_search）。
 *
 * プロンプトは登録文をそのまま user メッセージにする（システムプロンプト無し・
 * allowed_domains 無し）。実際のユーザー体験に近い回答を測るため。
 */
import {
  extractCitations,
  extractSearchQueries,
  extractSearchResults,
  extractText,
  getAnthropicClient,
  isAnthropicEnabled,
  MODELS,
  toApiError,
  webSearchTool,
} from "@/lib/llm/anthropic";
import { PROVIDERS_META } from "./meta";
import { DEFAULT_TIMEOUT_MS } from "./http";
import { toAnswer, type AskOptions, type ParsedAnswer, type Provider } from "./types";
import type { ProviderResult } from "../types";

const META = PROVIDERS_META.claude;

/** 1 回答あたりの検索回数の上限 */
const MAX_SEARCHES = 5;

/**
 * Messages API の応答 → 回答本文・引用・検索クエリ（純関数）。
 * 引用は「本文の citations」と「web_search_tool_result の検索結果」の和集合で、
 * 本文が根拠にしたものを先に並べる。
 */
export function parseClaudeMessage(message: unknown): ParsedAnswer {
  const blocks = message as { content?: unknown; usage?: unknown } | null | undefined;
  const usageRaw = blocks?.usage as Record<string, unknown> | undefined;
  const inputTokens = typeof usageRaw?.input_tokens === "number" ? usageRaw.input_tokens : 0;
  const outputTokens = typeof usageRaw?.output_tokens === "number" ? usageRaw.output_tokens : 0;
  return {
    answer: extractText(blocks),
    citations: [...extractCitations(blocks), ...extractSearchResults(blocks)].map((c) => ({
      url: c.url,
      title: c.title,
    })),
    searchQueries: extractSearchQueries(blocks),
    usage: { inputTokens, outputTokens },
  };
}

export const claudeProvider: Provider = {
  id: META.id,
  label: META.label,
  meta: META,
  model: () => MODELS.default,
  enabled: isAnthropicEnabled,
  async ask(prompt: string, options: AskOptions = {}): Promise<ProviderResult> {
    const model = MODELS.default;
    try {
      const message = await getAnthropicClient().messages.create(
        {
          model,
          max_tokens: 2_048,
          messages: [{ role: "user", content: prompt }],
          tools: [webSearchTool({ maxUses: MAX_SEARCHES })],
        },
        {
          ...(options.signal ? { signal: options.signal } : {}),
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        },
      );
      return toAnswer(META.id, model, parseClaudeMessage(message));
    } catch (err) {
      return { ok: false, providerId: META.id, model, error: toApiError(err).message };
    }
  },
};
