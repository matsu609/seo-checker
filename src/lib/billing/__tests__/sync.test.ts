/**
 * Webhook が Clerk に契約状態を書くところ（sync.ts）と、Webhook・申し込みの入口（2026-09-23 の修正）。
 *
 *   - 生きている契約があるのに別の契約のイベントが来たら、Stripe に確かめてから捨てる（二重の申し込み）
 *   - ふつうのはじめての契約・再契約は今までどおり保存する
 *   - Price の環境変数が外れても、既存のライトの契約をスタンダードに書き換えない（metadata.plan）
 *   - 書き込みは変えるキーだけ（updateUserMetadata は深いマージ。丸ごと送ると他の書き込みを巻き戻す）
 *   - Webhook は鍵と署名シークレットだけで受け取る（Price が無くても 503 にしない）
 *   - 契約済みの人の申し込みは 409（2 本目のサブスクリプションを作らない）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const updateUserMetadata = vi.fn();
const authMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
  clerkClient: async () => ({ users: { getUser: (id: string) => getUser(id), updateUserMetadata: (...a: unknown[]) => updateUserMetadata(...a) } }),
}));

import { stateFromSubscription, STRIPE_STATE_KEY, type SubscriptionLike } from "../state";
import { applySubscription } from "../sync";

const sub = (id: string, over: Partial<SubscriptionLike> = {}): SubscriptionLike => ({
  id,
  status: "active",
  cancel_at_period_end: false,
  items: { data: [{ price: { id: "price_standard", unit_amount: 50_000, currency: "jpy" }, current_period_end: 1_760_000_000 }] },
  metadata: { userId: "user_1", plan: "standard" },
  ...over,
});

function userWith(publicMetadata: Record<string, unknown>, privateMetadata: Record<string, unknown> = {}) {
  getUser.mockResolvedValue({ id: "user_1", publicMetadata, privateMetadata });
}

beforeEach(() => {
  getUser.mockReset();
  updateUserMetadata.mockReset();
  authMock.mockReset();
  currentUserMock.mockReset();
  vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard");
  vi.stubEnv("STRIPE_PRICE_LIGHT", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("契約状態の保存", () => {
  it("はじめての契約は保存し、送るのは stripe のキーと顧客 ID だけ", async () => {
    userWith({ plan: "light", featureOverrides: ["faq"], role: null }, { freeRuns: 2 });
    const saved = await applySubscription("user_1", sub("sub_1"), 10, "cus_1");
    expect(saved).toMatchObject({ subscriptionId: "sub_1", plan: "standard" });
    expect(updateUserMetadata).toHaveBeenCalledTimes(1);
    const [, params] = updateUserMetadata.mock.calls[0] as [string, { publicMetadata: Record<string, unknown>; privateMetadata?: Record<string, unknown> }];
    expect(Object.keys(params.publicMetadata)).toEqual([STRIPE_STATE_KEY]);
    expect(params.privateMetadata).toEqual({ stripeCustomerId: "cus_1" });
  });

  it("生きている契約があるのに届いた別の契約のイベントは、Stripe で生きていると確かめて捨てる", async () => {
    userWith({ [STRIPE_STATE_KEY]: stateFromSubscription(sub("sub_1"), 10, { plan: "standard" }) });
    const isAlive = vi.fn(async () => true);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await applySubscription("user_1", sub("sub_2", { status: "canceled" }), 999, null, { isAlive })).toBe(false);
    expect(isAlive).toHaveBeenCalledWith("sub_1");
    expect(updateUserMetadata).not.toHaveBeenCalled();
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("保存中の契約が実は終わっていた（イベントの取りこぼし）なら、新しい契約を締め出さない", async () => {
    userWith({ [STRIPE_STATE_KEY]: stateFromSubscription(sub("sub_1"), 10, { plan: "standard" }) });
    const saved = await applySubscription("user_1", sub("sub_2"), 5, null, { isAlive: async () => false });
    expect(saved).toMatchObject({ subscriptionId: "sub_2" });
  });

  it("解約済みの後の再契約は Stripe に問い合わせずに保存する", async () => {
    userWith({ [STRIPE_STATE_KEY]: stateFromSubscription(sub("sub_1", { status: "canceled" }), 10) });
    const isAlive = vi.fn(async () => true);
    expect(await applySubscription("user_1", sub("sub_2"), 20, null, { isAlive })).toMatchObject({ subscriptionId: "sub_2" });
    expect(isAlive).not.toHaveBeenCalled();
  });

  // STRIPE_PRICE_LIGHT を消した環境で、ライトのお客様の契約に更新イベントが来た
  it("Price の環境変数が外れても、Checkout が入れた metadata.plan でライトのまま記録する", async () => {
    userWith({});
    const light = sub("sub_1", {
      items: { data: [{ price: { id: "price_light", unit_amount: 38_000, currency: "jpy" }, current_period_end: 1 }] },
      metadata: { userId: "user_1", plan: "light" },
    });
    expect(await applySubscription("user_1", light, 1)).toMatchObject({ plan: "light" });
  });
});

describe("Webhook と申し込みの入口", () => {
  function enableAuth() {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  }

  it("Webhook は鍵と署名シークレットだけで受け取る（スタンダードの Price が無くても 503 にしない）", async () => {
    enableAuth();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("STRIPE_PRICE_STANDARD", "");
    const { POST } = await import("@/app/api/billing/webhook/route");
    // 署名が無いので 400（= 受け取りの処理まで進んでいる）
    const res = await POST(new Request("http://localhost/api/billing/webhook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    const { isStripeConfigured, isStripeWebhookConfigured } = await import("../stripe");
    expect(isStripeConfigured()).toBe(false);
    expect(isStripeWebhookConfigured()).toBe(true);
  });

  it("契約済みの人の申し込みは 409（2 本目のサブスクリプションを作らない）", async () => {
    enableAuth();
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    vi.stubEnv("STRIPE_PRICE_LIGHT", "price_light");
    authMock.mockResolvedValue({ userId: "user_1", actor: null });
    for (const status of ["active", "trialing", "past_due", "unpaid", "paused"]) {
      currentUserMock.mockResolvedValue({ id: "user_1", publicMetadata: { [STRIPE_STATE_KEY]: stateFromSubscription(sub("sub_1", { status }), 1, { plan: "standard" }) } });
      const { POST } = await import("@/app/api/billing/checkout/route");
      const res = await POST(new Request("http://localhost/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "light" }) }));
      expect(res.status, status).toBe(409);
      expect(await res.json()).toMatchObject({ code: "already_subscribed" });
    }
  });
});
