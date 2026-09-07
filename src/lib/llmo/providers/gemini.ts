/**
 * Gemini（generateContent + Google 検索グラウンディング）。SDK は足さず fetch で叩く。
 *
 * 引用は groundingMetadata.groundingChunks[].web、
 * ファンアウトは groundingMetadata.webSearchQueries から取る。
 */
import { failureMessage, postJson } from "./http";
import { PROVIDERS_META } from "./meta";
import { toAnswer, type AskOptions, type ParsedAnswer, type Provider } from "./types";
import type { ProviderCitation, ProviderResult } from "../types";

const META = PROVIDERS_META.gemini;

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** 既定モデル。GEMINI_MODEL で差し替えられる */
export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** generateContent の応答 → 回答本文・引用・検索クエリ（純関数） */
export function parseGeminiResponse(payload: unknown): ParsedAnswer {
  const root = isRecord(payload) ? payload : {};
  const texts: string[] = [];
  const citations: ProviderCitation[] = [];
  const searchQueries: string[] = [];

  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  for (const rawCandidate of candidates) {
    if (!isRecord(rawCandidate)) continue;
    const content = rawCandidate.content;
    if (isRecord(content) && Array.isArray(content.parts)) {
      for (const rawPart of content.parts) {
        if (!isRecord(rawPart)) continue;
        const text = str(rawPart.text);
        if (text) texts.push(text);
      }
    }
    const grounding = rawCandidate.groundingMetadata;
    if (!isRecord(grounding)) continue;
    if (Array.isArray(grounding.groundingChunks)) {
      for (const rawChunk of grounding.groundingChunks) {
        if (!isRecord(rawChunk)) continue;
        const web = rawChunk.web;
        if (!isRecord(web)) continue;
        const url = str(web.uri) ?? str(web.url);
        if (url) citations.push({ url, title: str(web.title) ?? str(web.domain) });
      }
    }
    if (Array.isArray(grounding.webSearchQueries)) {
      for (const q of grounding.webSearchQueries) {
        const s = str(q);
        if (s) searchQueries.push(s);
      }
    }
  }

  const usageRaw = isRecord(root.usageMetadata) ? root.usageMetadata : undefined;
  return {
    answer: texts.join("\n"),
    citations,
    searchQueries,
    usage: {
      inputTokens: typeof usageRaw?.promptTokenCount === "number" ? usageRaw.promptTokenCount : 0,
      outputTokens: typeof usageRaw?.candidatesTokenCount === "number" ? usageRaw.candidatesTokenCount : 0,
    },
  };
}

export const geminiProvider: Provider = {
  id: META.id,
  label: META.label,
  meta: META,
  model: geminiModel,
  enabled: () => Boolean(process.env.GEMINI_API_KEY?.trim()),
  async ask(prompt: string, options: AskOptions = {}): Promise<ProviderResult> {
    const model = geminiModel();
    try {
      // キーは URL ではなくヘッダで渡す（ログや Referer に残さないため）
      const payload = await postJson(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
        headers: { "x-goog-api-key": process.env.GEMINI_API_KEY?.trim() ?? "" },
        body: {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
        },
        ...(options.signal ? { signal: options.signal } : {}),
        ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
      });
      return toAnswer(META.id, model, parseGeminiResponse(payload));
    } catch (err) {
      return { ok: false, providerId: META.id, model, error: failureMessage(err) };
    }
  },
};
