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
  serpapi: () => has("SERPAPI_KEY"),
  // DataForSEO は login と password の両方が要る
  dataforseo: () => has("DATAFORSEO_LOGIN") && has("DATAFORSEO_PASSWORD"),
  pagespeed: () => has("PAGESPEED_API_KEY"),
  // CrUX は専用キーが無ければ PageSpeed のキーで動く
  crux: () => has("CRUX_API_KEY") || has("PAGESPEED_API_KEY"),
  ahrefs: () => has("AHREFS_API_KEY"),
  places: () => has("GOOGLE_PLACES_API_KEY"),
  // OAuth（Clerk の Google 連携）。環境変数では分からないので、/api/integrations がログイン中の人の接続状態で上書きする
  "google-business": () => false,
  // 鍵・スタンダードの Price（旧名 STRIPE_PRICE_PRO も可）・Webhook がそろって申し込みが出る（isStripeConfigured と同じ条件）
  stripe: () => has("STRIPE_SECRET_KEY") && (has("STRIPE_PRICE_STANDARD") || has("STRIPE_PRICE_PRO")) && has("STRIPE_WEBHOOK_SECRET"),
  supabase: () => has("SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY"),
  // メール送信（Resend）。鍵と差出人の両方が要る
  resend: () => has("RESEND_API_KEY") && has("MAIL_FROM"),
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
