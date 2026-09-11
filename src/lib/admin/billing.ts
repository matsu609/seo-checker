/**
 * Clerk Billing の契約情報 → マスター画面に出す形。純粋関数だけを置く。
 *
 * Clerk の Billing API は公開ベータで、返る形が変わりうる。壊れた値で画面ごと
 * 落とさないよう、他の外部 API 用パーサ（google/*, ga4/*）と同じく
 * 「例外を投げず、読めない値は null にする」方針で書く。
 *
 * 金額は最小単位（円なら 1 = 1 円、ドルなら 1 = 1 セント）で来るので、
 * 通貨ごとの桁を見て表示用の文字列を作る。
 */
import { planFromStripeState, type StripeState } from "@/lib/billing/state";
import { toPlanId, type PlanId } from "@/lib/plans/catalog";

/** 小数を持たない通貨。円はここに入るので 100 で割ってはいけない */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK", "XAF", "XOF", "XPF"]);

export interface Money {
  /** 表示用（例 "¥5,000"） */
  label: string;
  /** 通貨の主単位に直した数値（円なら 5000、ドルなら 10.0） */
  value: number;
  currency: string;
}

export type ContractStatus =
  | "active"
  | "trial"
  | "past_due"
  | "canceled"
  | "ended"
  | "upcoming"
  | "none"
  | "unknown";

export interface Coupon {
  /** 割引の表示名 */
  name: string;
  /** 使われたクーポンコード（手動付与などコードが無い場合もある） */
  promoCode: string | null;
  /** 「20% 割引」「1,000 円引き」など */
  effectLabel: string;
  /** 実際に引かれている額 */
  amount: Money | null;
  /** 残り適用回数。null は無期限 */
  cyclesRemaining: number | null;
}

export interface BillingSummary {
  status: ContractStatus;
  statusLabel: string;
  /** Clerk 側のプランのスラッグから引いたアプリのプラン */
  plan: PlanId | null;
  /** Clerk 側のプラン名（スラッグがずれていても運用者が気づけるように出す） */
  planName: string | null;
  /** 次回の請求額（割引適用後）。取れなければ null */
  monthly: Money | null;
  /** 割引前の額。割引が無ければ monthly と同じになる */
  subtotal: Money | null;
  nextPaymentAt: number | null;
  periodEndAt: number | null;
  coupon: Coupon | null;
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  active: "契約中",
  trial: "無料トライアル中",
  past_due: "支払い遅延",
  canceled: "解約手続き済み",
  ended: "終了",
  upcoming: "開始待ち",
  none: "契約なし",
  unknown: "不明",
};

export function statusLabel(status: ContractStatus): string {
  return STATUS_LABELS[status];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

/** BillingMoneyAmount 相当の値を表示用に直す */
export function toMoney(value: unknown): Money | null {
  if (!isRecord(value)) return null;
  const raw = num(value.amount);
  if (raw === null) return null;
  const currency = typeof value.currency === "string" && value.currency ? value.currency.toUpperCase() : "JPY";
  const minor = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const main = minor === 0 ? raw : raw / 100;
  const label = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency,
    minimumFractionDigits: minor,
    maximumFractionDigits: minor,
  }).format(main);
  return { label, value: main, currency };
}

/** 契約状況。free trial は status に出ないので item 側を見て上書きする */
export function toContractStatus(rawStatus: unknown, isFreeTrial: boolean): ContractStatus {
  if (isFreeTrial) return "trial";
  if (typeof rawStatus !== "string") return "unknown";
  switch (rawStatus) {
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "ended":
    case "expired":
    case "abandoned":
      return "ended";
    case "upcoming":
    case "incomplete":
      return "upcoming";
    default:
      return "unknown";
  }
}

function toCoupon(discount: unknown): Coupon | null {
  if (!isRecord(discount)) return null;
  const name = typeof discount.name === "string" && discount.name ? discount.name : "割引";
  const percentOff = num(discount.percentOff);
  const amountOff = toMoney(discount.amountOff);
  const effect = discount.effect;
  let effectLabel = "割引";
  if (effect === "percentage" && percentOff !== null) effectLabel = `${percentOff}% 割引`;
  else if (effect === "fixed_amount" && amountOff) effectLabel = `${amountOff.label} 引き`;
  return {
    name,
    promoCode: typeof discount.promoCode === "string" && discount.promoCode ? discount.promoCode : null,
    effectLabel,
    amount: toMoney(discount.amount),
    cyclesRemaining: num(discount.cyclesRemaining),
  };
}

/**
 * getUserBillingSubscription() の戻り値をマスター画面用にまとめる。
 * 契約が無いときは null を渡す想定（"none" を返す）。
 */
export function summarizeSubscription(subscription: unknown): BillingSummary {
  const empty: BillingSummary = {
    status: "none",
    statusLabel: STATUS_LABELS.none,
    plan: null,
    planName: null,
    monthly: null,
    subtotal: null,
    nextPaymentAt: null,
    periodEndAt: null,
    coupon: null,
  };
  if (!isRecord(subscription)) return empty;

  const items = Array.isArray(subscription.subscriptionItems) ? subscription.subscriptionItems : [];
  // 終わった item は無視して、今おカネが動いているものを 1 つ選ぶ
  const live = items.filter(isRecord).filter((i) => i.status !== "ended" && i.status !== "abandoned");
  const item = live[0] ?? items.filter(isRecord)[0] ?? null;

  const isFreeTrial = item?.isFreeTrial === true;
  const status = toContractStatus(subscription.status, isFreeTrial);

  const plan = isRecord(item?.plan) ? item.plan : null;
  const planName = plan && typeof plan.name === "string" ? plan.name : null;
  const planId = plan && typeof plan.slug === "string" ? toPlanId(plan.slug) : null;

  const nextPayment = isRecord(subscription.nextPayment) ? subscription.nextPayment : null;
  const totals = nextPayment && isRecord(nextPayment.totals) ? nextPayment.totals : null;
  const discounts = totals && isRecord(totals.discounts) ? totals.discounts : null;

  // 割引後の実額。totals があればそちらが正（クーポン適用後）
  const monthly =
    (totals && toMoney(totals.grandTotal)) ??
    (nextPayment && toMoney(nextPayment.amount)) ??
    (item ? toMoney(item.amount) : null);

  return {
    status,
    statusLabel: STATUS_LABELS[status],
    plan: planId,
    planName,
    monthly,
    subtotal: (totals && toMoney(totals.subtotal)) ?? monthly,
    nextPaymentAt: nextPayment ? num(nextPayment.date) : null,
    periodEndAt: item ? num(item.periodEnd) : null,
    coupon: discounts ? toCoupon(discounts.discount) : null,
  };
}

/** Stripe 直結の契約状態（publicMetadata.stripe）→ マスター画面用。金額は Stripe の Price から */
export function summarizeStripeState(state: StripeState): BillingSummary {
  const status: ContractStatus =
    state.status === "trialing" ? "trial"
    : state.status === "active" ? (state.cancelAtPeriodEnd ? "canceled" : "active")
    : state.status === "past_due" ? "past_due"
    : state.status === "canceled" || state.status === "incomplete_expired" || state.status === "unpaid" ? "ended"
    : state.status === "incomplete" ? "upcoming"
    : "unknown";
  const monthly = state.amount !== null && state.currency ? toMoney({ amount: state.amount, currency: state.currency }) : null;
  const periodEnd = state.currentPeriodEnd ? Date.parse(state.currentPeriodEnd) : null;
  return {
    status,
    statusLabel: STATUS_LABELS[status],
    plan: planFromStripeState(state),
    planName: "Stripe: オールインワン",
    monthly,
    subtotal: monthly,
    nextPaymentAt: state.cancelAtPeriodEnd ? null : periodEnd,
    periodEndAt: periodEnd,
    coupon: null,
  };
}
