/**
 * ChatGPT（OpenAI Responses API + web_search ツール）。SDK は足さず fetch で叩く。
 *
 * 引用は output_text の annotations（type: "url_citation"）、
 * ファンアウトは web_search_call アイテムの検索アクション（query）から取る。
 */
import { failureMessage, postJson } from "./http";
import { PROVIDERS_META } from "./meta";
import { toAnswer, type AskOptions, type ParsedAnswer, type Provider } from "./types";
import type { ProviderCitation, ProviderResult } from "../types";

const META = PROVIDERS_META.openai;

const ENDPOINT = "https://api.openai.com/v1/responses";

/** 既定モデル。OPENAI_MODEL で差し替えられる */
export function openaiModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-5";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** web_search_call アイテムから検索クエリを取り出す（形が版によって違うので広めに読む） */
function queriesOfSearchCall(item: Record<string, unknown>): string[] {
  const out: string[] = [];
  const direct = str(item.query);
  if (direct) out.push(direct);
  const action = item.action;
  if (isRecord(action)) {
    const q = str(action.query);
    if (q) out.push(q);
    if (Array.isArray(action.queries)) {
      for (const v of action.queries) {
        const s = str(v);
        if (s) out.push(s);
      }
    }
  }
  return out;
}

/** Responses API の応答 → 回答本文・引用・検索クエリ（純関数） */
export function parseOpenAiResponse(payload: unknown): ParsedAnswer {
  const root = isRecord(payload) ? payload : {};
  const texts: string[] = [];
  const citations: ProviderCitation[] = [];
  const searchQueries: string[] = [];

  const output = Array.isArray(root.output) ? root.output : [];
  for (const rawItem of output) {
    if (!isRecord(rawItem)) continue;
    if (rawItem.type === "web_search_call") {
      searchQueries.push(...queriesOfSearchCall(rawItem));
      continue;
    }
    if (rawItem.type !== "message" || !Array.isArray(rawItem.content)) continue;
    for (const rawPart of rawItem.content) {
      if (!isRecord(rawPart)) continue;
      if (rawPart.type !== "output_text") continue;
      const text = str(rawPart.text);
      if (text) texts.push(text);
      if (!Array.isArray(rawPart.annotations)) continue;
      for (const rawAnn of rawPart.annotations) {
        if (!isRecord(rawAnn) || rawAnn.type !== "url_citation") continue;
        const url = str(rawAnn.url);
        if (url) citations.push({ url, title: str(rawAnn.title) });
      }
    }
  }

  // 便宜フィールドしか返ってこない応答への保険
  if (texts.length === 0) {
    const fallback = str(root.output_text);
    if (fallback) texts.push(fallback);
  }

  const usageRaw = isRecord(root.usage) ? root.usage : undefined;
  return {
    answer: texts.join("\n"),
    citations,
    searchQueries,
    usage: {
      inputTokens: typeof usageRaw?.input_tokens === "number" ? usageRaw.input_tokens : 0,
      outputTokens: typeof usageRaw?.output_tokens === "number" ? usageRaw.output_tokens : 0,
    },
  };
}

export const openaiProvider: Provider = {
  id: META.id,
  label: META.label,
  meta: META,
  model: openaiModel,
  enabled: () => Boolean(process.env.OPENAI_API_KEY?.trim()),
  async ask(prompt: string, options: AskOptions = {}): Promise<ProviderResult> {
    const model = openaiModel();
    try {
      const payload = await postJson(ENDPOINT, {
        headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY?.trim() ?? ""}` },
        body: { model, input: prompt, tools: [{ type: "web_search" }] },
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      });
      return toAnswer(META.id, model, parseOpenAiResponse(payload));
    } catch (err) {
      return { ok: false, providerId: META.id, model, error: failureMessage(err) };
    }
  },
};
