/**
 * 割引コードの試行回数の制限。サーバー専用（プロセス内メモリ。src/lib/free/ratelimit.ts）。
 *
 * 割引コードは「正しければ 200、違えば 404」を返すので、制限が無いと総当たりで有効なコードを
 * 探せてしまう（コードは相手ごとに配る値引きで、当たれば毎月最大 50,000 円引き）。2026-09-23 に追加。
 * 確認（/api/billing/promo）と申し込み（/api/billing/checkout のコード付き）で同じ枠を使う
 * （片方だけ絞っても、もう片方で探せるため）。
 *
 * 1 人 1 時間 10 回。ふつうは 1〜2 回で済む。Vercel は複数インスタンスで動くので厳密ではないが、
 * 総当たりに要る回数（数万〜）には遠く届かない。
 */
import { takeClientToken, type WindowLimit } from "@/lib/free/ratelimit";

export const PROMO_ATTEMPTS_PER_HOUR: WindowLimit = { windowMs: 60 * 60 * 1000, limit: 10 };

export const PROMO_LIMIT_MESSAGE = "割引コードの確認が続けて行われました。1 時間ほど待ってからもう一度お試しください。";

/** 1 回ぶん使う。枠が残っていれば true */
export function takePromoAttempt(userId: string, now = Date.now()): boolean {
  return takeClientToken("billing-promo", userId, PROMO_ATTEMPTS_PER_HOUR, now);
}

/** 枠を使い切ったときの 429 */
export function promoLimitResponse(): Response {
  return Response.json({ error: PROMO_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store" } });
}
