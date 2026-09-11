/**
 * Stripe の契約状態（Clerk の publicMetadata.stripe に保存する形）と、そこからプランを決める純粋関数。
 * クライアントでも読める。
 *
 * 決済の実体は Stripe（Checkout でカード決済 → サブスクリプション）。Webhook が契約の変化を受け取り、
 * この形にして Clerk のユーザーに書く（sync.ts）。アプリはデータベースを持たず、プランの判定は
 * この値だけを見る（current.ts / resolve.ts）。顧客 ID（cus_…）は privateMetadata に置く。
 *
 * Clerk Billing はドルにしか対応していないため（2026-09 時点）、円建ての 9,800 円は Stripe 直結にした。
 */
import { z } from "zod";
import type { PlanId } from "@/lib/plans/catalog";

/** publicMetadata のキー */
export const STRIPE_STATE_KEY = "stripe";
/** privateMetadata のキー（Stripe の顧客 ID） */
export const STRIPE_CUSTOMER_KEY = "stripeCustomerId";

/** Stripe のサブスクリプションの status（https://docs.stripe.com/billing/subscriptions/overview） */
export const STRIPE_STATUSES = ["trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const;
export type StripeStatus = (typeof STRIPE_STATUSES)[number];

export const StripeStateSchema = z.object({
  subscriptionId: z.string(),
  status: z.enum(STRIPE_STATUSES),
  /** Stripe の Price ID（price_…）。STRIPE_PRICE_PRO と一致すればオールインワン */
  priceId: z.string().nullable().default(null),
  /** 月額（最小単位。円なら 1 = 1 円）と通貨。画面と管理画面の表示用 */
  amount: z.number().nullable().default(null),
  currency: z.string().nullable().default(null),
  /** 現在の請求期間の終わり（ISO 8601） */
  currentPeriodEnd: z.string().nullable().default(null),
  /** 期間末で解約する予約が入っているか */
  cancelAtPeriodEnd: z.boolean().default(false),
  /** この状態を作った Stripe イベントの created（秒）。古いイベントで上書きしないために持つ */
  eventCreated: z.number().default(0),
  updatedAt: z.string(),
});
export type StripeState = z.infer<typeof StripeStateSchema>;

export function stripeStateFromMetadata(metadata: unknown): StripeState | null {
  if (!metadata || typeof metadata !== "object") return null;
  const parsed = StripeStateSchema.safeParse((metadata as Record<string, unknown>)[STRIPE_STATE_KEY]);
  return parsed.success ? parsed.data : null;
}

/**
 * 契約状態 → プラン。有効（active / trialing）と支払い遅延（past_due。Stripe が再請求する猶予中）は pro。
 * それ以外（解約・未払い・未完了・一時停止）は契約なし = null（他の判定に落ちる）。
 * Price が STRIPE_PRICE_PRO と違うときも pro 扱い（売っているのは 1 つだけ。将来プランを増やすならここで分ける）。
 */
export function planFromStripeState(state: StripeState | null): PlanId | null {
  if (!state) return null;
  return state.status === "active" || state.status === "trialing" || state.status === "past_due" ? "pro" : null;
}

/** 契約があるとみなす（お支払い方法の変更・解約の画面を出す）状態か */
export function hasStripeSubscription(state: StripeState | null): boolean {
  return planFromStripeState(state) !== null || state?.status === "unpaid" || state?.status === "paused";
}

/** 古いイベント（並び順が入れ替わった再送）で新しい状態を上書きしないための判定 */
export function shouldApplyEvent(current: StripeState | null, eventCreated: number): boolean {
  if (!current) return true;
  return eventCreated >= current.eventCreated;
}

/** Webhook で受け取るサブスクリプションのうち、保存に要る部分（stripe の型から独立させてテストしやすくする） */
export interface SubscriptionLike {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  items: { data: { price: { id: string; unit_amount: number | null; currency: string }; current_period_end: number }[] };
}

export function stateFromSubscription(sub: SubscriptionLike, eventCreated: number, now = new Date()): StripeState {
  const item = sub.items.data[0] ?? null;
  const status = (STRIPE_STATUSES as readonly string[]).includes(sub.status) ? (sub.status as StripeStatus) : "incomplete";
  return {
    subscriptionId: sub.id,
    status,
    priceId: item?.price.id ?? null,
    amount: item?.price.unit_amount ?? null,
    currency: item?.price.currency?.toUpperCase() ?? null,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    eventCreated,
    updatedAt: now.toISOString(),
  };
}

export const STRIPE_STATUS_LABELS: Record<StripeStatus, string> = {
  trialing: "無料トライアル中",
  active: "契約中",
  past_due: "支払い遅延（カードをご確認ください）",
  canceled: "解約済み",
  unpaid: "未払い（停止中）",
  incomplete: "お支払い未完了",
  incomplete_expired: "お支払い期限切れ",
  paused: "一時停止",
};
