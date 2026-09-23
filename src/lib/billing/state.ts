/**
 * Stripe の契約状態（Clerk の publicMetadata.stripe に保存する形）と、そこからプランを決める純粋関数。
 * クライアントでも読める。
 *
 * 決済の実体は Stripe（Checkout でカード決済 → サブスクリプション）。Webhook が契約の変化を受け取り、
 * この形にして Clerk のユーザーに書く（sync.ts）。アプリはデータベースを持たず、プランの判定は
 * この値だけを見る（current.ts / resolve.ts）。顧客 ID（cus_…）は privateMetadata に置く。
 *
 * Clerk Billing はドルにしか対応していないため（2026-09 時点）、円建ての料金は Stripe 直結にした。
 */
import { z } from "zod";
import { RECOMMENDED_PLAN, toPlanId, type PlanId } from "@/lib/plans/catalog";
import { patternById } from "./promo";

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
  /** Stripe の Price ID（price_…） */
  priceId: z.string().nullable().default(null),
  /**
   * 契約しているプラン（light / standard）。Webhook が Price ID から引いて書く。
   * この画面はクライアントでも読むので、env を引かずに済むよう保存しておく。
   * 2026-09-15 より前に作られた契約にはこの値が無い（= 当時の唯一の商品 = いまのスタンダード）。
   */
  plan: z.string().nullable().default(null),
  /**
   * 月額（最小単位。円なら 1 = 1 円）と通貨。画面と管理画面の表示用。
   * 割引が付いていて額が分かるときは**割引後**（2026-09-23 まで割引前の定価を入れていたので、
   * 割引のお客様の料金画面に定価が出ていた）。
   */
  amount: z.number().nullable().default(null),
  currency: z.string().nullable().default(null),
  /** 割引前の月額（割引が付いているときだけ。無ければ null） */
  listAmount: z.number().nullable().default(null),
  /**
   * 付いている割引の説明（「月額 10,000 円引き」など）。無ければ null。
   * 額が分からない割引（Stripe の画面で手で付けたクーポンなど）は「割引あり」で、amount は定価のまま
   */
  discountLabel: z.string().nullable().default(null),
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
 * 契約状態 → プラン。有効（active / trialing）と支払い遅延（past_due。Stripe が再請求する猶予中）が契約中。
 * それ以外（解約・未払い・未完了・一時停止）は契約なし = null（他の判定に落ちる）。
 *
 * どのプランかは保存してある `plan` を見る。入っていない（2026-09-15 より前の契約）か、
 * 知らない値のときは本命のスタンダード扱いにする。ここで free に倒すと、
 * 払っている人がツールを使えなくなるため。
 */
export function planFromStripeState(state: StripeState | null): PlanId | null {
  if (!state) return null;
  const active = state.status === "active" || state.status === "trialing" || state.status === "past_due";
  if (!active) return null;
  return toPlanId(state.plan) ?? RECOMMENDED_PLAN.id;
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

/**
 * Webhook のイベントを保存してよいか。
 *
 *   apply      … 保存する
 *   stale      … 同じ契約の古いイベント（並び順が入れ替わった再送）。捨てる
 *   other-live … 保存中の契約とは**別の契約**のイベントで、保存中の契約がまだ生きている。
 *                呼び出し側が Stripe に保存中の契約を確かめ、本当に生きていれば捨てる（sync.ts）
 *
 * 別の契約を時刻だけで比べていた（2026-09-23 まで）ため、二重に申し込んだ 2 本目や、解約した古い契約の
 * 遅れて届いたイベントが、生きている契約の状態を上書きできた（払っているのに「解約済み」になる）。
 * 保存中の契約が解約済み・未完了（hasStripeSubscription が false）なら、新しい契約をそのまま受け入れる（ふつうの再契約）。
 */
export type SubscriptionEventDecision = "apply" | "stale" | "other-live";

export function decideSubscriptionEvent(current: StripeState | null, subscriptionId: string, eventCreated: number): SubscriptionEventDecision {
  if (!current) return "apply";
  if (current.subscriptionId !== subscriptionId) return hasStripeSubscription(current) ? "other-live" : "apply";
  return shouldApplyEvent(current, eventCreated) ? "apply" : "stale";
}

/** クーポン（Stripe の Coupon の必要な部分） */
export interface CouponLike {
  amount_off?: number | null;
  percent_off?: number | null;
  currency?: string | null;
}

/**
 * サブスクリプションに付いた割引。Webhook の本文では ID（文字列）だけで届く（Stripe の API 2025 以降）。
 * 展開（expand）したときだけ source.coupon にクーポンの中身が入る。
 */
export type DiscountLike = string | { source?: { coupon?: string | CouponLike | null } | null } | null;

/** Webhook で受け取るサブスクリプションのうち、保存に要る部分（stripe の型から独立させてテストしやすくする） */
export interface SubscriptionLike {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  items: { data: { price: { id: string; unit_amount: number | null; currency: string }; current_period_end: number }[] };
  /** 付いている割引（無ければ空）。古いテストデータには無い */
  discounts?: readonly DiscountLike[] | null;
  /** Checkout が入れた userId / plan / promo（src/lib/billing/stripe.ts の createCheckoutSession） */
  metadata?: Record<string, string> | null;
}

export interface StateFromSubscriptionOptions {
  /** Price ID から引いたプラン（サーバー側で解決して渡す。planForSubscription）。null なら本命として読む */
  plan?: PlanId | null;
  now?: Date;
}

const yen = (n: number) => `${n.toLocaleString("ja-JP")} 円`;

/**
 * 割引後の月額と説明。追加の API 呼び出しはしない（Webhook の本文にあるものだけで決める）。
 *
 *   1. 割引が展開されていてクーポンの中身が読める → その値引き（額 or 率）
 *   2. 割引は付いているが ID だけ → Checkout が入れた metadata.promo（割引コードのパターン。値引き額が決まっている）
 *   3. どちらでも額が分からない → 「割引あり」とだけ記録し、額は定価のまま（推測で書かない）
 *   割引が 1 つも付いていなければ定価のまま（metadata.promo が残っていても、クーポンを外した後なら値引きは無い）
 */
export function discountOf(sub: Pick<SubscriptionLike, "discounts" | "metadata">, listAmount: number | null, currency: string | null): { amount: number | null; listAmount: number | null; label: string | null } {
  const discounts = (sub.discounts ?? []).filter((d) => d !== null && d !== undefined);
  if (discounts.length === 0 || listAmount === null) return { amount: listAmount, listAmount: null, label: null };
  const coupons = discounts
    .map((d) => (typeof d === "object" && d && typeof d.source?.coupon === "object" ? d.source.coupon : null))
    .filter((c): c is CouponLike => c !== null);
  if (coupons.length > 0) {
    let amount = listAmount;
    const labels: string[] = [];
    for (const c of coupons) {
      if (typeof c.amount_off === "number" && (!c.currency || !currency || c.currency.toUpperCase() === currency.toUpperCase())) {
        amount -= c.amount_off;
        labels.push(currency === "JPY" || !currency ? `月額 ${yen(c.amount_off)}引き` : "値引き");
      } else if (typeof c.percent_off === "number") {
        amount = Math.round(amount * (1 - c.percent_off / 100));
        labels.push(`${c.percent_off}% 割引`);
      }
    }
    if (labels.length > 0) return { amount: Math.max(0, amount), listAmount, label: labels.join(" + ") };
  }
  const pattern = typeof sub.metadata?.promo === "string" ? patternById(sub.metadata.promo) : null;
  if (pattern && pattern.amountOff > 0 && (currency === null || currency === "JPY")) {
    return { amount: Math.max(0, listAmount - pattern.amountOff), listAmount, label: `月額 ${yen(pattern.amountOff)}引き` };
  }
  return { amount: listAmount, listAmount, label: "割引あり" };
}

export function stateFromSubscription(sub: SubscriptionLike, eventCreated: number, options: StateFromSubscriptionOptions = {}): StripeState {
  const { plan = null, now = new Date() } = options;
  const item = sub.items.data[0] ?? null;
  const status = (STRIPE_STATUSES as readonly string[]).includes(sub.status) ? (sub.status as StripeStatus) : "incomplete";
  const currency = item?.price.currency?.toUpperCase() ?? null;
  const discount = discountOf(sub, item?.price.unit_amount ?? null, currency);
  return {
    subscriptionId: sub.id,
    status,
    priceId: item?.price.id ?? null,
    plan,
    amount: discount.amount,
    currency,
    listAmount: discount.listAmount,
    discountLabel: discount.label,
    currentPeriodEnd: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    eventCreated,
    updatedAt: now.toISOString(),
  };
}

/**
 * どのプランの契約か。Webhook が契約状態に書く `plan` を決める（純粋。価格の対応表は引数で受け取る）。
 *
 *   1. Price ID → プラン（環境変数 STRIPE_PRICE_*。いちばん確か）
 *   2. 引けないとき（例: STRIPE_PRICE_LIGHT を消した・入れ間違えた）:
 *      a. 同じ契約・同じ価格で前に保存したプラン（価格が変わっていなければプランも変わっていない）
 *      b. Checkout が入れた subscription.metadata.plan。ただし、そのプランの価格が設定されていて今の価格と
 *         違うなら使わない（ポータルでプランを変えた後で、metadata は申し込み時のまま古い）
 *   3. どれも無ければ null（planFromStripeState が本命のスタンダードとして読む）
 *
 * 2026-09-23 まで 1 だけで決めていたので、STRIPE_PRICE_LIGHT が消えると次のイベントで
 * ライトのお客様がスタンダードとして記録された（M-2）。
 */
export function planForSubscription(input: {
  priceId: string | null;
  metadataPlan: unknown;
  /** 同じ契約の保存済みの状態（別の契約なら null を渡す） */
  current: StripeState | null;
  planForPrice: (priceId: string | null) => PlanId | null;
  priceOfPlan: (plan: PlanId) => string | null;
}): PlanId | null {
  const byPrice = input.planForPrice(input.priceId);
  if (byPrice) return byPrice;
  if (input.current && input.priceId && input.current.priceId === input.priceId) {
    const kept = toPlanId(input.current.plan);
    if (kept) return kept;
  }
  const fromMetadata = toPlanId(input.metadataPlan);
  if (fromMetadata) {
    const configured = input.priceOfPlan(fromMetadata);
    if (!configured || configured === input.priceId) return fromMetadata;
  }
  return null;
}

/**
 * 契約状況の呼び名。お客様の画面（StripeBillingCard）と顧客管理（admin/billing.ts）の両方がここを使う。
 * 2026-09-23 まで顧客管理は別の対応表を持っていて、未払い（unpaid）を「終了」、一時停止（paused）を
 * 「不明」と出していた（どちらも Stripe 上は契約が残っている状態）。
 */
export const STRIPE_STATUS_LABELS: Record<StripeStatus, string> = {
  trialing: "無料トライアル中",
  active: "契約中",
  past_due: "支払い遅延",
  canceled: "解約済み",
  unpaid: "未払い（停止中）",
  incomplete: "お支払い未完了",
  incomplete_expired: "お支払い期限切れ",
  paused: "一時停止",
};

/**
 * 契約状況の表示。customer はお客様の画面用で、支払い遅延にカードの確認を促す一言を添える。
 * 解約の予約が入っていて、まだ契約が生きているときは「（期間末で解約予定）」を付ける。
 */
export function stripeStatusLabel(state: StripeState, audience: "customer" | "operator" = "customer"): string {
  const base = STRIPE_STATUS_LABELS[state.status];
  const hint = audience === "customer" && state.status === "past_due" ? "（カードをご確認ください）" : "";
  const canceling = state.cancelAtPeriodEnd && hasStripeSubscription(state) ? "（期間末で解約予定）" : "";
  return `${base}${hint}${canceling}`;
}
