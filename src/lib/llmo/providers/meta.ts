/**
 * LLM プロバイダの「名札」だけを持つモジュール（クライアントからも import する）。
 *
 * 実際の呼び出し（SDK・fetch・API キー）はサーバー専用の各 provider モジュールにある。
 * 画面はここのラベルと連携キーだけを見るので、キーの値はもちろん SDK もバンドルされない。
 */
import type { IntegrationKey } from "@/lib/features/integrations";

export const PROVIDER_IDS = ["claude", "openai", "gemini", "perplexity"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderMeta {
  id: ProviderId;
  /** 画面に出す名前 */
  label: string;
  /** 対応する外部連携（GET /api/integrations の boolean と対応） */
  integration: IntegrationKey;
  /** 未設定のときに案内する環境変数名 */
  envVar: string;
  /**
   * ファンアウト（LLM が内部で発行した検索クエリ）を取得できるか。
   * Perplexity は引用 URL しか返さないので false（B8 で「対象外」と明記する）。
   */
  fanoutSupported: boolean;
  /** Web 検索の呼び方（画面の補足に出す） */
  searchNote: string;
}

export const PROVIDERS_META: Record<ProviderId, ProviderMeta> = {
  claude: {
    id: "claude",
    label: "Claude",
    integration: "anthropic",
    envVar: "ANTHROPIC_API_KEY",
    fanoutSupported: true,
    searchNote: "Messages API + サーバーツール web_search",
  },
  openai: {
    id: "openai",
    label: "ChatGPT",
    integration: "openai",
    envVar: "OPENAI_API_KEY",
    fanoutSupported: true,
    searchNote: "Responses API + web_search ツール",
  },
  gemini: {
    id: "gemini",
    label: "Gemini",
    integration: "gemini",
    envVar: "GEMINI_API_KEY",
    fanoutSupported: true,
    searchNote: "generateContent + Google 検索グラウンディング",
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    integration: "perplexity",
    envVar: "PERPLEXITY_API_KEY",
    fanoutSupported: false,
    searchNote: "Sonar chat completions（検索クエリは取得不可）",
  },
};

export const PROVIDERS_META_LIST: readonly ProviderMeta[] = PROVIDER_IDS.map((id) => PROVIDERS_META[id]);

/** 未知の文字列を ProviderId に絞り込む */
export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

/** 表示用のラベル（未知の ID はそのまま返す） */
export function providerLabel(id: string): string {
  return isProviderId(id) ? PROVIDERS_META[id].label : id;
}
