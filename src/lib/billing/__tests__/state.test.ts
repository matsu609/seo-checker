/**
 * Stripe の契約状態: サブスクリプション → 保存する形 → プラン。古いイベントで上書きしない。
 */
import { describe, expect, it } from "vitest";
import { summarizeStripeState } from "@/lib/admin/billing";
import { decideSubscriptionEvent, discountOf, hasStripeSubscription, planForSubscription, planFromStripeState, shouldApplyEvent, stateFromSubscription, STRIPE_STATE_KEY, stripeStateFromMetadata, stripeStatusLabel } from "../state";
import type { PlanId } from "@/lib/plans/catalog";

const SUB = {
  id: "sub_1",
  status: "active",
  cancel_at_period_end: false,
  items: { data: [{ price: { id: "price_standard", unit_amount: 50_000, currency: "jpy" }, current_period_end: 1_760_000_000 }] },
};

describe("Stripe の契約状態", () => {
  it("サブスクリプション → 保存する形（円は最小単位 = 1 円）", () => {
    const s = stateFromSubscription(SUB, 1_759_000_000, { plan: "standard", now: new Date("2026-09-11T00:00:00Z") });
    expect(s).toMatchObject({ subscriptionId: "sub_1", status: "active", priceId: "price_standard", plan: "standard", amount: 50_000, currency: "JPY", cancelAtPeriodEnd: false, eventCreated: 1_759_000_000, updatedAt: "2026-09-11T00:00:00.000Z" });
    expect(s.currentPeriodEnd).toBe(new Date(1_760_000_000 * 1000).toISOString());
    expect(stateFromSubscription({ ...SUB, status: "weird", items: { data: [] } }, 1).status).toBe("incomplete");
  });

  it("有効・トライアル・支払い遅延は契約中、それ以外は契約なし", () => {
    const base = stateFromSubscription(SUB, 1, { plan: "light" });
    expect(planFromStripeState(base)).toBe("light");
    expect(planFromStripeState({ ...base, status: "trialing" })).toBe("light");
    expect(planFromStripeState({ ...base, status: "past_due" })).toBe("light");
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const) {
      expect(planFromStripeState({ ...base, status }), status).toBeNull();
    }
    expect(planFromStripeState(null)).toBeNull();
    expect(hasStripeSubscription({ ...base, status: "unpaid" })).toBe(true);
    expect(hasStripeSubscription({ ...base, status: "canceled" })).toBe(false);
  });

  // 2026-09-15 の 3 段階化より前に作られた契約には plan が入っていない。
  // free に倒すと、払っている人がツールを使えなくなる
  it("プランが入っていない古い契約は本命（スタンダード）として読む", () => {
    const base = stateFromSubscription(SUB, 1);
    expect(base.plan).toBeNull();
    expect(planFromStripeState(base)).toBe("standard");
    expect(planFromStripeState({ ...base, plan: "pro" })).toBe("standard");
    expect(planFromStripeState({ ...base, plan: "なにこれ" })).toBe("standard");
  });

  it("publicMetadata から読む（壊れていれば null）。古いイベントは捨てる", () => {
    const state = stateFromSubscription(SUB, 100);
    expect(stripeStateFromMetadata({ [STRIPE_STATE_KEY]: state })).toEqual(state);
    expect(stripeStateFromMetadata({ [STRIPE_STATE_KEY]: { status: "active" } })).toBeNull();
    expect(stripeStateFromMetadata(null)).toBeNull();
    expect(shouldApplyEvent(state, 99)).toBe(false);
    expect(shouldApplyEvent(state, 100)).toBe(true);
    expect(shouldApplyEvent(null, 1)).toBe(true);
  });

  it("マスター画面用の要約（解約予約は「解約手続き済み」、金額は ¥50,000）", () => {
    const active = summarizeStripeState(stateFromSubscription(SUB, 1, { plan: "standard" }));
    expect(active).toMatchObject({ status: "active", plan: "standard", planName: "Stripe: スタンダード", monthly: { label: "￥50,000", value: 50_000, currency: "JPY" } });
    expect(active.nextPaymentAt).toBe(1_760_000_000 * 1000);
    const canceling = summarizeStripeState(stateFromSubscription({ ...SUB, cancel_at_period_end: true }, 1, { plan: "standard" }));
    expect(canceling.status).toBe("canceled");
    expect(canceling.nextPaymentAt).toBeNull();
    expect(summarizeStripeState(stateFromSubscription({ ...SUB, status: "canceled" }, 1))).toMatchObject({ status: "ended", plan: null, planName: "Stripe: 契約なし" });
  });

  it("契約状況の呼び名（お客様向けは支払い遅延にカードの確認を添える。解約予約は契約中の間だけ）", () => {
    const base = stateFromSubscription(SUB, 1, { plan: "standard" });
    expect(stripeStatusLabel({ ...base, status: "past_due" })).toBe("支払い遅延（カードをご確認ください）");
    expect(stripeStatusLabel({ ...base, status: "past_due" }, "operator")).toBe("支払い遅延");
    expect(stripeStatusLabel({ ...base, cancelAtPeriodEnd: true })).toBe("契約中（期間末で解約予定）");
    expect(stripeStatusLabel({ ...base, status: "canceled", cancelAtPeriodEnd: true })).toBe("解約済み");
  });
});

describe("別の契約のイベント（二重の申し込み・解約した古い契約。2026-09-23）", () => {
  const live = stateFromSubscription(SUB, 100, { plan: "standard" });

  it("はじめての契約・同じ契約の新しいイベントは保存する。古いイベントは捨てる", () => {
    expect(decideSubscriptionEvent(null, "sub_1", 1)).toBe("apply");
    expect(decideSubscriptionEvent(live, "sub_1", 101)).toBe("apply");
    expect(decideSubscriptionEvent(live, "sub_1", 99)).toBe("stale");
  });

  it("生きている契約があるのに別の契約のイベントが来たら、時刻が新しくても保存しない（確かめに回す）", () => {
    expect(decideSubscriptionEvent(live, "sub_2", 999)).toBe("other-live");
    for (const status of ["trialing", "past_due", "unpaid", "paused"] as const) {
      expect(decideSubscriptionEvent({ ...live, status }, "sub_2", 999), status).toBe("other-live");
    }
  });

  it("保存中の契約が解約済み・未完了なら、別の契約（ふつうの再契約）をそのまま受け入れる", () => {
    for (const status of ["canceled", "incomplete", "incomplete_expired"] as const) {
      expect(decideSubscriptionEvent({ ...live, status }, "sub_2", 1), status).toBe("apply");
    }
  });
});

describe("どのプランの契約か（Price の環境変数が外れたとき。M-2）", () => {
  const prices: Partial<Record<PlanId, string>> = { standard: "price_standard" };
  const lookups = {
    planForPrice: (id: string | null) => (Object.entries(prices).find(([, v]) => v === id)?.[0] as PlanId | undefined) ?? null,
    priceOfPlan: (plan: PlanId) => prices[plan] ?? null,
  };

  it("Price ID で引けるならそれ", () => {
    expect(planForSubscription({ priceId: "price_standard", metadataPlan: "light", current: null, ...lookups })).toBe("standard");
  });

  // STRIPE_PRICE_LIGHT を消した後の、既存のライトのお客様
  it("引けなければ Checkout が入れた metadata.plan（そのプランの価格が未設定なら信じる）", () => {
    expect(planForSubscription({ priceId: "price_light_old", metadataPlan: "light", current: null, ...lookups })).toBe("light");
  });

  it("同じ契約・同じ価格で前に保存したプランがあればそれを優先", () => {
    const kept = { ...stateFromSubscription(SUB, 1, { plan: "light" }), priceId: "price_light_old" };
    expect(planForSubscription({ priceId: "price_light_old", metadataPlan: null, current: kept, ...lookups })).toBe("light");
  });

  // ポータルでスタンダード → ライトに変えた後。metadata は申し込み時のまま "standard"
  it("metadata のプランの価格が設定済みで今の価格と違うなら、metadata は古いので使わない", () => {
    expect(planForSubscription({ priceId: "price_light_old", metadataPlan: "standard", current: null, ...lookups })).toBeNull();
  });

  it("何も分からなければ null（本命として読む）", () => {
    expect(planForSubscription({ priceId: null, metadataPlan: undefined, current: null, ...lookups })).toBeNull();
  });
});

describe("割引後の月額（M-4。追加の API 呼び出しなし）", () => {
  it("割引が無ければ定価のまま（metadata.promo が残っていても）", () => {
    expect(discountOf({ discounts: [], metadata: { promo: "off10" } }, 50_000, "JPY")).toEqual({ amount: 50_000, listAmount: null, label: null });
    expect(discountOf({}, 50_000, "JPY")).toEqual({ amount: 50_000, listAmount: null, label: null });
  });

  it("展開されたクーポン（金額引き・率引き）から計算する", () => {
    expect(discountOf({ discounts: [{ source: { coupon: { amount_off: 10_000, currency: "jpy" } } }] }, 50_000, "JPY")).toEqual({ amount: 40_000, listAmount: 50_000, label: "月額 10,000 円引き" });
    expect(discountOf({ discounts: [{ source: { coupon: { percent_off: 20 } } }] }, 50_000, "JPY")).toEqual({ amount: 40_000, listAmount: 50_000, label: "20% 割引" });
  });

  it("Webhook の本文（割引は ID だけ）では、Checkout が入れた割引コードのパターンから計算する", () => {
    expect(discountOf({ discounts: ["di_1"], metadata: { promo: "off20" } }, 50_000, "JPY")).toEqual({ amount: 30_000, listAmount: 50_000, label: "月額 20,000 円引き" });
    // ずっと無料（off50）は 0 円。マイナスにしない
    expect(discountOf({ discounts: ["di_1"], metadata: { promo: "off50" } }, 38_000, "JPY").amount).toBe(0);
  });

  it("額が分からない割引は「割引あり」とだけ残し、額は推測しない", () => {
    expect(discountOf({ discounts: ["di_1"], metadata: {} }, 50_000, "JPY")).toEqual({ amount: 50_000, listAmount: 50_000, label: "割引あり" });
  });

  it("契約状態にも割引後の額と定価が入り、顧客管理の要約にクーポンとして出る", async () => {
    const { summarizeStripeState } = await import("@/lib/admin/billing");
    const s = stateFromSubscription({ ...SUB, discounts: ["di_1"], metadata: { promo: "off10" } }, 1, { plan: "standard" });
    expect(s).toMatchObject({ amount: 40_000, listAmount: 50_000, discountLabel: "月額 10,000 円引き" });
    const summary = summarizeStripeState(s);
    expect(summary.monthly?.value).toBe(40_000);
    expect(summary.subtotal?.value).toBe(50_000);
    expect(summary.coupon).toMatchObject({ effectLabel: "月額 10,000 円引き", amount: { value: 10_000 }, cyclesRemaining: null });
    // 割引の無い契約はクーポン無し
    expect(summarizeStripeState(stateFromSubscription(SUB, 1)).coupon).toBeNull();
  });

  it("割引の欄が無い古い保存値も読める", () => {
    const old: Record<string, unknown> = { ...stateFromSubscription(SUB, 1) };
    delete old.listAmount;
    delete old.discountLabel;
    const read = stripeStateFromMetadata({ [STRIPE_STATE_KEY]: old });
    expect(read).toMatchObject({ amount: 50_000, listAmount: null, discountLabel: null });
  });
});
