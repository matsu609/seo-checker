/**
 * 無料期間（トライアル）の日数。クライアントでも読める純粋な関数だけを置く。
 *
 * 既定はトライアルなし（0 日）。申し込んだその場で初回の請求が立つ。
 * 無料期間や月額の値引きは、全員に自動で付けるのではなく割引コード（promo.ts、環境変数 PROMO_CODES）で
 * 相手ごとに渡す（利用者の決定 2026-09-18。「初月無料をやめる。コードを入力したときだけ値引き・無料期間」）。
 *
 * 環境変数 STRIPE_TRIAL_DAYS に正の数を入れると、その日数のトライアルが全員に付く（緊急時の逃げ道として残す）。
 * 0 や不正な値、未設定ならトライアルなし。Stripe の上限は 730 日。
 */

/** 既定の無料期間（日）。0 = トライアルなし。~~30（初月無料、2026-09-13）~~ → 0（2026-09-18） */
export const DEFAULT_TRIAL_DAYS = 0;
const MAX_TRIAL_DAYS = 730;

export function trialDays(raw = process.env.STRIPE_TRIAL_DAYS): number {
  if (raw === undefined) return DEFAULT_TRIAL_DAYS;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, MAX_TRIAL_DAYS);
}
