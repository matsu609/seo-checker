/**
 * Clerk Billing（決済の実体は Stripe）を使うかどうか。サーバー専用。
 *
 * 2 つの条件がそろったときだけ料金表を出す。
 *   1. NEXT_PUBLIC_CLERK_BILLING_ENABLED=1
 *      Clerk 側でプランを作る前に出すと空の枠だけが並ぶので、明示的に切り替える
 *   2. Clerk のキーがそろっている
 *      未設定だと ClerkProvider が無く、PricingTable が描画時に例外を投げて
 *      料金プランの画面ごと落ちる（開発・E2E はこの状態で動く）
 *
 * isAuthEnabled() と同じく、値は呼ばれたときに読む（束ねて固定しない）。
 */
import { isAuthEnabled } from "@/lib/auth/config";

/** 運用者が決済を有効にしたか。キーの有無は見ない */
export function isBillingFlagOn(): boolean {
  return process.env.NEXT_PUBLIC_CLERK_BILLING_ENABLED === "1";
}

/** 料金表を出してよいか */
export function isBillingEnabled(): boolean {
  return isBillingFlagOn() && isAuthEnabled();
}
