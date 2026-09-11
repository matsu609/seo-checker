/**
 * Stripe の契約状態: サブスクリプション → 保存する形 → プラン。古いイベントで上書きしない。
 */
import { describe, expect, it } from "vitest";
import { summarizeStripeState } from "@/lib/admin/billing";
import { hasStripeSubscription, planFromStripeState, shouldApplyEvent, stateFromSubscription, STRIPE_STATE_KEY, stripeStateFromMetadata } from "../state";

const SUB = {
  id: "sub_1",
  status: "active",
  cancel_at_period_end: false,
  items: { data: [{ price: { id: "price_pro", unit_amount: 9800, currency: "jpy" }, current_period_end: 1_760_000_000 }] },
};

describe("Stripe の契約状態", () => {
  it("サブスクリプション → 保存する形（円は最小単位 = 1 円）", () => {
    const s = stateFromSubscription(SUB, 1_759_000_000, new Date("2026-09-11T00:00:00Z"));
    expect(s).toMatchObject({ subscriptionId: "sub_1", status: "active", priceId: "price_pro", amount: 9800, currency: "JPY", cancelAtPeriodEnd: false, eventCreated: 1_759_000_000, updatedAt: "2026-09-11T00:00:00.000Z" });
    expect(s.currentPeriodEnd).toBe(new Date(1_760_000_000 * 1000).toISOString());
    expect(stateFromSubscription({ ...SUB, status: "weird", items: { data: [] } }, 1).status).toBe("incomplete");
  });

  it("有効・トライアル・支払い遅延は pro、それ以外は契約なし", () => {
    const base = stateFromSubscription(SUB, 1);
    expect(planFromStripeState(base)).toBe("pro");
    expect(planFromStripeState({ ...base, status: "trialing" })).toBe("pro");
    expect(planFromStripeState({ ...base, status: "past_due" })).toBe("pro");
    for (const status of ["canceled", "unpaid", "incomplete", "incomplete_expired", "paused"] as const) {
      expect(planFromStripeState({ ...base, status }), status).toBeNull();
    }
    expect(planFromStripeState(null)).toBeNull();
    expect(hasStripeSubscription({ ...base, status: "unpaid" })).toBe(true);
    expect(hasStripeSubscription({ ...base, status: "canceled" })).toBe(false);
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

  it("マスター画面用の要約（解約予約は「解約手続き済み」、金額は ¥9,800）", () => {
    const active = summarizeStripeState(stateFromSubscription(SUB, 1));
    expect(active).toMatchObject({ status: "active", plan: "pro", monthly: { label: "￥9,800", value: 9800, currency: "JPY" } });
    expect(active.nextPaymentAt).toBe(1_760_000_000 * 1000);
    const canceling = summarizeStripeState(stateFromSubscription({ ...SUB, cancel_at_period_end: true }, 1));
    expect(canceling.status).toBe("canceled");
    expect(canceling.nextPaymentAt).toBeNull();
    expect(summarizeStripeState(stateFromSubscription({ ...SUB, status: "canceled" }, 1))).toMatchObject({ status: "ended", plan: null });
  });
});
