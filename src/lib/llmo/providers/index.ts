/**
 * プロバイダの一覧（サーバー専用）。API ルートはここだけを見る。
 * 画面から使うのはラベルだけなので ./meta を import すること（SDK を含めないため）。
 */
import { claudeProvider } from "./claude";
import { geminiProvider } from "./gemini";
import { openaiProvider } from "./openai";
import { perplexityProvider } from "./perplexity";
import { PROVIDER_IDS, type ProviderId } from "./meta";
import type { Provider } from "./types";

export const PROVIDERS: Record<ProviderId, Provider> = {
  claude: claudeProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  perplexity: perplexityProvider,
};

export const PROVIDER_LIST: readonly Provider[] = PROVIDER_IDS.map((id) => PROVIDERS[id]);

export function getProvider(id: ProviderId): Provider {
  return PROVIDERS[id];
}

/** キーが設定されているプロバイダ */
export function enabledProviders(): Provider[] {
  return PROVIDER_LIST.filter((p) => p.enabled());
}

export { parseClaudeMessage } from "./claude";
export { parseGeminiResponse, geminiModel } from "./gemini";
export { parseOpenAiResponse, openaiModel } from "./openai";
export { parsePerplexityResponse, perplexityModel } from "./perplexity";
export type { Provider, AskOptions, ParsedAnswer } from "./types";
