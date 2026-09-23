/**
 * 顧客管理（/clients）に出す契約情報。純粋関数だけを置く。
 *
 * 契約の実体は Stripe 直結（Webhook が Clerk の publicMetadata.stripe に書く。src/lib/billing/）。
 * 2026-09-23 に Clerk Billing（getUserBillingSubscription を 1 人ずつ呼んでいた）の読み取りを外した。
 * Clerk Billing はドルにしか対応しておらず使っていないので、全員が「契約なし」で返っていただけだった。
 *
 * 呼び名は billing/state.ts の STRIPE_STATUS_LABELS、金額の桁は billing/money.ts を使う
 * （お客様の画面と同じ関数。顧客管理だけ別の表を持つと、同じ契約が画面ごとに違って見える）。
 */
import { moneyFromMinor, type Money } from "@/lib/billing/money";
import { planFromStripeState, stripeStatusLabel, type StripeState } from "@/lib/billing/state";
import { planLabel, type PlanId } from "@/lib/plans/catalog";

export type { Money } from "@/lib/billing/money";

/** 契約状況の色分け（components/admin/format.ts の STATUS_TONE）に使う区分 */
export type ContractStatus = "active" | "trial" | "past_due" | "canceled" | "ended" | "upcoming" | "none";

export interface Coupon {
  /** 割引の表示名 */
  name: string;
  /** 使われたクーポンコード（顧客ごとに設定した割引などコードが無い場合もある） */
  promoCode: string | null;
  /** 「10,000 円引き」など */
  effectLabel: string;
  /** 実際に引かれている額 */
  amount: Money | null;
  /** 残り適用回数。null は無期限 */
  cyclesRemaining: number | null;
}

export interface BillingSummary {
  status: ContractStatus;
  statusLabel: string;
  /** 契約から引いたアプリのプラン（契約が無ければ null） */
  plan: PlanId | null;
  /** 契約の表示名（「Stripe: スタンダード」） */
  planName: string | null;
  /** 次回の請求額（割引適用後）。取れなければ null */
  monthly: Money | null;
  /** 割引前の額。割引が無ければ monthly と同じになる */
  subtotal: Money | null;
  nextPaymentAt: number | null;
  periodEndAt: number | null;
  coupon: Coupon | null;
}

/** Stripe の契約が無い人 */
export const NO_CONTRACT: BillingSummary = {
  status: "none",
  statusLabel: "契約なし",
  plan: null,
  planName: null,
  monthly: null,
  subtotal: null,
  nextPaymentAt: null,
  periodEndAt: null,
  coupon: null,
};

/** 色分けの区分。Stripe 上で契約が残っている未払い・一時停止は「終了」にしない（請求の対応が要る） */
export function contractStatusOf(state: StripeState): ContractStatus {
  switch (state.status) {
    case "trialing":
      return "trial";
    case "active":
      return state.cancelAtPeriodEnd ? "canceled" : "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "paused":
      return "canceled";
    case "incomplete":
      return "upcoming";
    case "canceled":
    case "incomplete_expired":
      return "ended";
  }
}

/** 最小単位の金額 → 表示（互換のため残す。中身は billing/money.ts） */
export function toMoney(value: unknown): Money | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  return moneyFromMinor(v.amount, v.currency);
}

/**
 * 割引（Webhook が契約状態に書いた discountLabel / listAmount）→ 顧客管理のクーポン欄。
 * 2026-09-23 まで常に null で、割引のお客様にも「クーポンの適用はありません」と定価が出ていた。
 * 割引コードのクーポンは永続（duration: forever）なので残り回数は null（無期限）。
 */
export function couponOf(state: StripeState): Coupon | null {
  if (!state.discountLabel) return null;
  const off = state.listAmount !== null && state.amount !== null && state.listAmount > state.amount ? state.listAmount - state.amount : null;
  return {
    name: "割引",
    promoCode: null,
    effectLabel: state.discountLabel,
    amount: off !== null ? moneyFromMinor(off, state.currency) : null,
    cyclesRemaining: null,
  };
}

/** Stripe 直結の契約状態（publicMetadata.stripe）→ 顧客管理用。金額は Stripe の Price と割引から */
export function summarizeStripeState(state: StripeState): BillingSummary {
  const status = contractStatusOf(state);
  const monthly = state.amount !== null && state.currency ? moneyFromMinor(state.amount, state.currency) : null;
  const list = state.listAmount !== null && state.currency ? moneyFromMinor(state.listAmount, state.currency) : null;
  const periodEnd = state.currentPeriodEnd ? Date.parse(state.currentPeriodEnd) : null;
  const plan = planFromStripeState(state);
  return {
    status,
    statusLabel: stripeStatusLabel(state, "operator"),
    plan,
    planName: `Stripe: ${plan ? planLabel(plan) : "契約なし"}`,
    monthly,
    subtotal: list ?? monthly,
    nextPaymentAt: state.cancelAtPeriodEnd ? null : periodEnd,
    periodEndAt: periodEnd,
    coupon: couponOf(state),
  };
}

/** publicMetadata.stripe の有無で分ける（無ければ「契約なし」） */
export function summarizeBilling(state: StripeState | null): BillingSummary {
  return state ? summarizeStripeState(state) : NO_CONTRACT;
}
