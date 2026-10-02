/**
 * 無料診断の専用ログイン（/api/free/login・/api/free/logout・requireFreeAccess。利用者の決定 2026-10-02）。
 *
 * next/headers の cookies() を差し替えて、ログインで置いた Cookie がそのまま判定に通ることを見る。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    cookies: async () => ({
      get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
      set: (name: string, value: string, opts?: { maxAge?: number }) => {
        if (opts?.maxAge === 0) store.delete(name);
        else store.set(name, value);
      },
    }),
  };
});
vi.mock("next/headers", () => ({ cookies: jar.cookies }));

import { resetFreeLimits } from "@/lib/free/ratelimit";
import { FREE_SESSION_COOKIE } from "@/lib/free/session-rules";

function login(body: unknown, ip = "1.1.1.1"): Request {
  return new Request("http://localhost/api/free/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jar.store.clear();
  resetFreeLimits();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("FREE_DIAGNOSIS_ID", "demo");
  vi.stubEnv("FREE_DIAGNOSIS_PASSWORD", "correct horse");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("専用ログイン", () => {
  it("合えば Cookie を置き、以後 requireFreeAccess が通る。ログアウトで戻る", async () => {
    const { POST } = await import("@/app/api/free/login/route");
    const { POST: logout } = await import("@/app/api/free/logout/route");
    const { requireFreeAccess, hasFreeAccess } = await import("@/lib/free/access");

    expect(await hasFreeAccess()).toBe(false);
    const denied = await requireFreeAccess();
    expect(denied?.status).toBe(401);
    expect((await denied!.json()).code).toBe("free_login");

    const res = await POST(login({ id: "demo", password: "correct horse" }));
    expect(res.status).toBe(200);
    expect(jar.store.get(FREE_SESSION_COOKIE)).toMatch(/^\d+\./);
    expect(await requireFreeAccess()).toBeNull();

    await logout();
    expect(jar.store.has(FREE_SESSION_COOKIE)).toBe(false);
    expect(await hasFreeAccess()).toBe(false);
  });

  it("ID かパスワードが違えば 401 で、Cookie は置かない（前後の空白は ID だけ許す）", async () => {
    const { POST } = await import("@/app/api/free/login/route");
    expect((await POST(login({ id: "demo", password: "wrong" }))).status).toBe(401);
    expect((await POST(login({ id: "nope", password: "correct horse" }))).status).toBe(401);
    expect((await POST(login({ id: "demo", password: " correct horse" }))).status).toBe(401);
    expect(jar.store.has(FREE_SESSION_COOKIE)).toBe(false);
    expect((await POST(login({ id: " demo ", password: "correct horse" }))).status).toBe(200);
  });

  it("形式の誤りは 400、IP ごとに 10 分で 10 回を超えると 429", async () => {
    const { POST } = await import("@/app/api/free/login/route");
    expect((await POST(login({ id: 1 }))).status).toBe(400);
    for (let i = 0; i < 10; i++) expect((await POST(login({ id: "demo", password: "wrong" }, "2.2.2.2"))).status).toBe(401);
    expect((await POST(login({ id: "demo", password: "correct horse" }, "2.2.2.2"))).status).toBe(429);
    // 別の IP は影響を受けない
    expect((await POST(login({ id: "demo", password: "correct horse" }, "3.3.3.3"))).status).toBe(200);
  });

  it("ID とパスワードが未設定なら 503。Clerk も無い環境（開発・E2E）では判定が素通り", async () => {
    vi.stubEnv("FREE_DIAGNOSIS_ID", "");
    vi.stubEnv("FREE_DIAGNOSIS_PASSWORD", "");
    const { POST } = await import("@/app/api/free/login/route");
    expect((await POST(login({ id: "demo", password: "x" }))).status).toBe(503);
    const { requireFreeAccess } = await import("@/lib/free/access");
    // Clerk がある本番相当では閉じる
    expect((await requireFreeAccess())?.status).toBe(401);
    // Clerk も無ければ開く
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(await requireFreeAccess()).toBeNull();
  });

  it("ID かパスワードを変えると、置いてあった Cookie は無効になる", async () => {
    const { POST } = await import("@/app/api/free/login/route");
    const { hasFreeAccess } = await import("@/lib/free/access");
    await POST(login({ id: "demo", password: "correct horse" }));
    expect(await hasFreeAccess()).toBe(true);
    vi.stubEnv("FREE_DIAGNOSIS_PASSWORD", "new password");
    expect(await hasFreeAccess()).toBe(false);
  });
});
