/**
 * 決済・顧客管理の API の入口（2026-09-23 の修正の回帰テスト。ネットワークには出ない）。
 *
 *   1. 顧客管理の API は、権限の無い人には本文に関係なく 404（400 で API の存在を教えない）
 *   2. 本文が null・形違いでも 500 にならず 400
 *   3. 認証が無効な環境（開発・E2E）で、代理ログインの判定を呼んで 500 にならない
 *   4. 割引コードの確認は 1 人 1 時間 10 回まで（総当たりで有効なコードを探させない）
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getUserMock = vi.fn();
const currentUserMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => authMock(),
  currentUser: () => currentUserMock(),
  clerkClient: async () => ({ users: { getUser: (id: string) => getUserMock(id), updateUserMetadata: vi.fn() } }),
}));

const saveUserStore = vi.fn();
vi.mock("@/lib/db/user-stores", () => ({
  listUserStores: vi.fn(async () => ({})),
  saveUserStore: (...args: unknown[]) => saveUserStore(...args),
  removeUserStore: vi.fn(),
}));

import { resetFreeLimits } from "@/lib/free/ratelimit";

function post(url: string, body: string | null): Request {
  return new Request(`http://localhost${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: body ?? undefined });
}

function enableAuth() {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("ADMIN_EMAILS", "ops@example.com");
}

function disableAuth() {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
}

function enableStripe() {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  vi.stubEnv("STRIPE_PRICE_STANDARD", "price_standard");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
  vi.stubEnv("PROMO_CODES", "GOOD-CODE=off10");
}

/** ふつうのお客様（運用者でも管理アカウントでもない） */
const CUSTOMER = { id: "user_customer", publicMetadata: {}, privateMetadata: {}, emailAddresses: [{ id: "e", emailAddress: "c@example.com", verification: { status: "verified" } }], primaryEmailAddressId: "e" };

beforeEach(() => {
  authMock.mockReset();
  getUserMock.mockReset();
  currentUserMock.mockReset();
  saveUserStore.mockReset();
  resetFreeLimits();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("顧客管理の API は、権限の無い人には本文に関係なく 404", () => {
  const routes = [
    ["features", () => import("@/app/api/admin/features/route")],
    ["promo", () => import("@/app/api/admin/promo/route")],
    ["impersonate", () => import("@/app/api/admin/impersonate/route")],
  ] as const;

  it.each(routes)("/api/admin/%s", async (name, load) => {
    enableAuth();
    authMock.mockResolvedValue({ userId: CUSTOMER.id });
    getUserMock.mockResolvedValue(CUSTOMER);
    const { POST } = await load();
    for (const body of ["null", "{", JSON.stringify({ nope: 1 })]) {
      const res = await POST(post(`/api/admin/${name}`, body));
      expect(res.status, `${name} ${body}`).toBe(404);
    }
  });

  it("運用者なら本文の検証まで進む（400）", async () => {
    enableAuth();
    authMock.mockResolvedValue({ userId: "user_ops" });
    getUserMock.mockResolvedValue({ ...CUSTOMER, id: "user_ops", emailAddresses: [{ id: "e", emailAddress: "ops@example.com", verification: { status: "verified" } }] });
    const { POST } = await import("@/app/api/admin/features/route");
    expect((await POST(post("/api/admin/features", "null"))).status).toBe(400);
  });
});

describe("割引コードの確認（/api/billing/promo）", () => {
  it("本文が null でも 500 にしない", async () => {
    disableAuth();
    enableStripe();
    const { POST } = await import("@/app/api/billing/promo/route");
    expect((await POST(post("/api/billing/promo", "null"))).status).toBe(400);
    expect((await POST(post("/api/billing/promo", JSON.stringify({ code: 123 })))).status).toBe(400);
  });

  it("1 人 1 時間 10 回まで。11 回目は正しいコードでも 429", async () => {
    disableAuth();
    enableStripe();
    const { POST } = await import("@/app/api/billing/promo/route");
    for (let i = 0; i < 10; i++) {
      expect((await POST(post("/api/billing/promo", JSON.stringify({ code: `WRONG-${i}` })))).status).toBe(404);
    }
    const res = await POST(post("/api/billing/promo", JSON.stringify({ code: "GOOD-CODE" })));
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "rate_limited" });
  });

  it("正しいコードなら説明を返す", async () => {
    disableAuth();
    enableStripe();
    const { POST } = await import("@/app/api/billing/promo/route");
    const res = await POST(post("/api/billing/promo", JSON.stringify({ code: " good-code " })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: "GOOD-CODE" });
  });
});

describe("申し込み（/api/billing/checkout）とお支払いの管理（/api/billing/portal）", () => {
  it("認証が無効な環境では 503（代理ログインの判定で 500 にしない）", async () => {
    disableAuth();
    enableStripe();
    const checkout = await import("@/app/api/billing/checkout/route");
    const portal = await import("@/app/api/billing/portal/route");
    expect((await checkout.POST(post("/api/billing/checkout", "{}"))).status).toBe(503);
    expect((await portal.POST(post("/api/billing/portal", null))).status).toBe(503);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("本文が null・形違い・知らないプランは 400", async () => {
    enableAuth();
    enableStripe();
    authMock.mockResolvedValue({ userId: CUSTOMER.id, actor: null });
    currentUserMock.mockResolvedValue(CUSTOMER);
    getUserMock.mockResolvedValue(CUSTOMER);
    const { POST } = await import("@/app/api/billing/checkout/route");
    expect((await POST(post("/api/billing/checkout", "null"))).status).toBe(400);
    expect((await POST(post("/api/billing/checkout", JSON.stringify({ plan: 1 })))).status).toBe(400);
    const unknown = await POST(post("/api/billing/checkout", JSON.stringify({ plan: "enterprise" })));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toMatchObject({ code: "not_purchasable" });
  });

  it("コード付きの申し込みも確認の API と同じ枠を使う", async () => {
    enableAuth();
    enableStripe();
    authMock.mockResolvedValue({ userId: CUSTOMER.id, actor: null });
    currentUserMock.mockResolvedValue(CUSTOMER);
    getUserMock.mockResolvedValue(CUSTOMER);
    const { POST } = await import("@/app/api/billing/checkout/route");
    for (let i = 0; i < 10; i++) {
      const res = await POST(post("/api/billing/checkout", JSON.stringify({ plan: "standard", code: `WRONG-${i}` })));
      expect(await res.json()).toMatchObject({ code: "bad_promo" });
    }
    const res = await POST(post("/api/billing/checkout", JSON.stringify({ plan: "standard", code: "GOOD-CODE" })));
    expect(res.status).toBe(429);
  });
});

describe("認証が無効な環境で 500 にならない", () => {
  it("ストアの保存（代理ログインの判定を飛ばす）", async () => {
    disableAuth();
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    const { PUT } = await import("@/app/api/store/route");
    const res = await PUT(new Request("http://localhost/api/store", { method: "PUT", body: JSON.stringify({ name: "projects", value: [] }) }));
    expect(res.status).toBe(204);
    expect(saveUserStore).toHaveBeenCalledWith("local", "projects", []);
    expect(authMock).not.toHaveBeenCalled();
  });

  it("登録情報の保存は 503", async () => {
    disableAuth();
    const { POST } = await import("@/app/api/account/lead/route");
    expect((await POST(post("/api/account/lead", "{}"))).status).toBe(503);
  });

  it("代理ログインの判定は Clerk を呼ばずに false", async () => {
    disableAuth();
    const { isImpersonating } = await import("@/lib/admin/impersonate");
    await expect(isImpersonating()).resolves.toBe(false);
    expect(authMock).not.toHaveBeenCalled();
  });
});
