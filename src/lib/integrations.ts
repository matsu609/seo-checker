/**
 * 外部連携（API キー）の有無を boolean で返す。サーバー専用。
 *
 * キーの値は絶対に返さない・ログに出さない。クライアントには
 * GET /api/integrations 経由でこの boolean だけを渡す。
 * 連携の一覧・環境変数名・説明は src/lib/features/integrations.ts（クライアントでも読める）。
 */
import { INTEGRATIONS, INTEGRATION_KEYS, type IntegrationKey, type IntegrationStatus } from "./features/integrations";
import { keyExpiry, type KeyExpiry } from "./features/key-expiry";

function has(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const CHECKS: Record<IntegrationKey, () => boolean> = {
  anthropic: () => has("ANTHROPIC_API_KEY"),
  openai: () => has("OPENAI_API_KEY"),
  gemini: () => has("GEMINI_API_KEY"),
  perplexity: () => has("PERPLEXITY_API_KEY"),
  serpapi: () => has("SERPAPI_KEY"),
  pagespeed: () => has("PAGESPEED_API_KEY"),
  ahrefs: () => has("AHREFS_API_KEY"),
  openpagerank: () => has("OPENPAGERANK_API_KEY"),
  // GA4 はプロパティ ID とサービスアカウント JSON の両方が必要
  ga4: () => has("GA4_PROPERTY_ID") && has("GOOGLE_SERVICE_ACCOUNT_JSON"),
  places: () => has("GOOGLE_PLACES_API_KEY"),
  supabase: () => has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
};

/** 各連携が設定済みかどうか（値は含まない） */
export function getIntegrationStatus(): IntegrationStatus {
  const status = {} as IntegrationStatus;
  for (const key of INTEGRATION_KEYS) status[key] = CHECKS[key]();
  return status;
}

export function isIntegrationEnabled(key: IntegrationKey): boolean {
  return CHECKS[key]();
}

/** キーに寿命がある連携の残り日数。日付だけを返す（キーの値は絶対に返さない） */
export type IntegrationExpiries = Partial<Record<IntegrationKey, KeyExpiry>>;

export function getKeyExpiries(now = new Date()): IntegrationExpiries {
  const out: IntegrationExpiries = {};
  for (const key of INTEGRATION_KEYS) {
    const lifetime = INTEGRATIONS[key].keyLifetime;
    // キーそのものが未設定なら期限を出しても意味がない
    if (!lifetime || !CHECKS[key]()) continue;
    out[key] = keyExpiry(process.env[lifetime.issuedAtEnv], lifetime, now);
  }
  return out;
}
