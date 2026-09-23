/**
 * 顧客一覧の行づくり（buildClientRows）。
 *
 * 2026-09-23 まで、1 人ずつ Clerk Billing の契約を問い合わせ、プランの決め方も自前で組み立てていた。
 * いまは publicMetadata だけから作る純粋関数で、プランはログイン中の本人と同じ resolvePlanFromMetadata。
 */
import { describe, expect, it, vi } from "vitest";

// clients.ts は loadClients のために Clerk を import している。行づくりは Clerk に触らないことも確かめる
const getUser = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser }, billing: { getUserBillingSubscription: getUser } }),
}));

import { stateFromSubscription, STRIPE_STATE_KEY } from "@/lib/billing/state";
import { buildClientRows, type ClerkUserLike } from "../clients";

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
