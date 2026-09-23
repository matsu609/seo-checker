/**
 * 顧客一覧の行づくり（buildClientRows）。
 *
 * 2026-09-23 まで、1 人ずつ Clerk Billing の契約を問い合わせ、プランの決め方も自前で組み立てていた。
 * いまは publicMetadata だけから作る純粋関数で、プランはログイン中の本人と同じ resolvePlanFromMetadata。
 */
import { describe, expect, it, vi } from "vitest";

// clients.ts は loadClients のために Clerk を import している。行づくりは Clerk に触らないことも確かめる
const getUser = vi.fn();
const updateUserMetadata = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser, updateUserMetadata }, billing: { getUserBillingSubscription: getUser } }),
}));

import { stateFromSubscription, STRIPE_STATE_KEY } from "@/lib/billing/state";
import { assignClientPromo, buildClientRows, toggleClientFeature, type ClerkUserLike } from "../clients";

const SUB = {
  id: "sub_1",
  status: "active",
  cancel_at_period_end: false,
  items: { data: [{ price: { id: "price_l", unit_amount: 38_000, currency: "jpy" }, current_period_end: 1_760_000_000 }] },
};

function user(over: Partial<ClerkUserLike> = {}): ClerkUserLike {
  return {
    id: "user_1",
    firstName: "太郎",
    lastName: "山田",
    username: null,
    primaryEmailAddressId: "e2",
    emailAddresses: [
      { id: "e1", emailAddress: "old@example.com" },
      { id: "e2", emailAddress: "main@example.com" },
    ],
    publicMetadata: {},
    createdAt: 1,
    lastActiveAt: null,
    ...over,
  };
}

describe("顧客一覧の行", () => {
  it("Stripe の契約があれば、その契約のプランと金額を出す", () => {
    const [row] = buildClientRows([user({ publicMetadata: { [STRIPE_STATE_KEY]: stateFromSubscription(SUB, 1, { plan: "light" }), plan: "premium" } })], null);
    expect(row).toMatchObject({ plan: "light", planSource: "billing", email: "main@example.com", name: "山田 太郎" });
    expect(row.billing).toMatchObject({ status: "active", plan: "light", monthly: { value: 38_000 } });
  });

  it("契約が無ければ「契約なし」で、プランは手動 → 既定の順", () => {
    const [manual, env] = buildClientRows([user({ publicMetadata: { plan: "standard" } }), user({ id: "user_2" })], "light");
    expect(manual).toMatchObject({ plan: "standard", planSource: "metadata" });
    expect(manual.billing.status).toBe("none");
    expect(env).toMatchObject({ plan: "light", planSource: "env" });
  });

  it("Clerk には 1 回も問い合わせない（人数ぶんの API 呼び出しが無い）", () => {
    buildClientRows([user(), user({ id: "user_2" }), user({ id: "user_3" })], null);
    expect(getUser).not.toHaveBeenCalled();
  });
});

// Clerk の updateUserMetadata は深いマージ。publicMetadata を丸ごと送り直すと、読んでから書くまでの間に
// Webhook が書いた契約状態などを古い値で巻き戻す（2026-09-23 まで）。変えるキーだけを送る
describe("顧客管理からの書き込みは変えるキーだけ", () => {
  it("機能の個別開放", async () => {
    getUser.mockResolvedValue({ publicMetadata: { plan: "light", stripe: { subscriptionId: "sub_old" }, featureOverrides: ["rank"] } });
    updateUserMetadata.mockReset();
    const next = await toggleClientFeature("user_1", "faq", true);
    expect(next).toEqual(["faq", "rank"]);
    expect(updateUserMetadata).toHaveBeenCalledWith("user_1", { publicMetadata: { featureOverrides: ["faq", "rank"] } });
  });

  // 画面を 1 つ開けると、その画面を塞いでいる旧 ID もまとめて開く（M-1。2026-09-23）
  it("ページ改善を開けると page-diagnosis も付く", async () => {
    getUser.mockResolvedValue({ publicMetadata: {} });
    updateUserMetadata.mockReset();
    expect(await toggleClientFeature("user_1", "page-improve", true)).toEqual(["page-diagnosis", "page-improve"]);
    getUser.mockResolvedValue({ publicMetadata: { featureOverrides: ["page-diagnosis", "page-improve", "faq"] } });
    expect(await toggleClientFeature("user_1", "page-improve", false)).toEqual(["faq"]);
  });

  it("割引", async () => {
    updateUserMetadata.mockReset();
    await assignClientPromo("user_1", "off10", "user_ops");
    const [, params] = updateUserMetadata.mock.calls[0] as [string, { publicMetadata: Record<string, unknown> }];
    expect(Object.keys(params.publicMetadata)).toEqual(["promo"]);
  });
});
