/**
 * 無料期間（トライアル）の日数。クライアントでも読める純粋な関数だけを置く。
 *
 * 環境変数 STRIPE_TRIAL_DAYS で変える（未設定なら既定の 30 日 = 初月無料）。
 * 0 や不正な値ならトライアルなし（申し込んだその場で初回の請求が立つ）。
 * Stripe の上限は 730 日。
 */

/** 既定の無料期間（日）。利用者の決定 2026-09-13「初月無料」 */
export const DEFAULT_TRIAL_DAYS = 30;
const MAX_TRIAL_DAYS = 730;

export function trialDays(raw = process.env.STRIPE_TRIAL_DAYS): number {
  if (raw === undefined) return DEFAULT_TRIAL_DAYS;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_TRIAL_DAYS);
}
