/**
 * Perplexity（Sonar chat completions）。SDK は足さず fetch で叩く。
 *
 * 引用は citations（URL の配列）と search_results（title / url）。
 * 検索クエリ（ファンアウト）は API から取れないので常に空で返す（B8 では「対象外」）。
 */
import { failureMessage, postJson } from "./http";
import { PROVIDERS_META } from "./meta";
import { toAnswer, type AskOptions, type ParsedAnswer, type Provider } from "./types";
import type { ProviderCitation, ProviderResult } from "../types";

const META = PROVIDERS_META.perplexity;

const ENDPOINT = "https://api.perplexity.ai/chat/completions";

/** 既定モデル。PERPLEXITY_MODEL で差し替えられる */
export function perplexityModel(): string {
  return process.env.PERPLEXITY_MODEL?.trim() || "sonar";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Sonar の応答 → 回答本文・引用（純関数）。searchQueries は常に空 */
export function parsePerplexityResponse(payload: unknown): ParsedAnswer {
  const root = isRecord(payload) ? payload : {};
  const texts: string[] = [];
  const citations: ProviderCitation[] = [];

  const choices = Array.isArray(root.choices) ? root.choices : [];
  for (const rawChoice of choices) {
    if (!isRecord(rawChoice)) continue;
    const message = rawChoice.message;
    if (!isRecord(message)) continue;
    const content = message.content;
    const text = str(content);
    if (text) {
      texts.push(text);
    } else if (Array.isArray(content)) {
      // content が配列で返る版（[{type:"text", text:"..."}]）
      for (const part of content) {
        if (!isRecord(part)) continue;
        const t = str(part.text);
        if (t) texts.push(t);
      }
    }
  }

  // search_results のほうがタイトルを持つので先に読む
  if (Array.isArray(root.search_results)) {
    for (const rawResult of root.search_results) {
      if (!isRecord(rawResult)) continue;
      const url = str(rawResult.url);
      if (url) citations.push({ url, title: str(rawResult.title) });
    }
  }
  if (Array.isArray(root.citations)) {
    for (const raw of root.citations) {
      const url = str(raw);
      if (url) {
        citations.push({ url, title: null });
        continue;
      }
      if (isRecord(raw)) {
        const u = str(raw.url);
        if (u) citations.push({ url: u, title: str(raw.title) });
      }
    }
  }

  const usageRaw = isRecord(root.usage) ? root.usage : undefined;
  return {
    answer: texts.join("\n"),
    citations,
    searchQueries: [],
    usage: {
      inputTokens: typeof usageRaw?.prompt_tokens === "number" ? usageRaw.prompt_tokens : 0,
      outputTokens: typeof usageRaw?.completion_tokens === "number" ? usageRaw.completion_tokens : 0,
    },
  };
}

export const perplexityProvider: Provider = {
  id: META.id,
  label: META.label,
  meta: META,
  model: perplexityModel,
  enabled: () => Boolean(process.env.PERPLEXITY_API_KEY?.trim()),
  async ask(prompt: string, options: AskOptions = {}): Promise<ProviderResult> {
    const model = perplexityModel();
    try {
      const payload = await postJson(ENDPOINT, {
        headers: { authorization: `Bearer ${process.env.PERPLEXITY_API_KEY?.trim() ?? ""}` },
        body: { model, messages: [{ role: "user", content: prompt }] },
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      });
      return toAnswer(META.id, model, parsePerplexityResponse(payload));
    } catch (err) {
      return { ok: false, providerId: META.id, model, error: failureMessage(err) };
    }
  },
};
