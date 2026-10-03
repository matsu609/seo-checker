/**
 * 無料診断の固定リンク（GET /free・requireFreeAccess）と月の回数（利用者の決定 2026-10-02 → 10-03）。
 *
 * next/headers の cookies() を差し替えて、リンクで置いた Cookie がそのまま判定に通ることを見る。
 * 月の回数は Clerk（運用者の privateMetadata）を差し替えて数える。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerk = vi.hoisted(() => {
  const state: { privateMetadata: Record<string, unknown> } = { privateMetadata: {} };
  const operator = { id: "user_op", emailAddresses: [{ id: "e", emailAddress: "op@example.com", verification: { status: "verified" } }], primaryEmailAddressId: "e" };
  return {
    state,
    clerkClient: async () => ({
      users: {
        getUserList: async () => ({ data: [operator], totalCount: 1 }),
        getUser: async () => ({ ...operator, privateMetadata: state.privateMetadata }),
        updateUserMetadata: async (_id: string, patch: { privateMetadata: Record<string, unknown> }) => {
          state.privateMetadata = { ...state.privateMetadata, ...patch.privateMetadata };
        },
      },
    }),
  };
});
vi.mock("@clerk/nextjs/server", () => ({ clerkClient: clerk.clerkClient }));

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

import { resetFreeRunsMemory } from "@/lib/free/monthly";
import { FREE_SESSION_COOKIE } from "@/lib/free/session-rules";

/** Set-Cookie から値を取り出して、次のリクエストの Cookie にする */
function adoptCookie(res: Response) {
  const header = res.headers.get("set-cookie") ?? "";
  const m = header.match(new RegExp(`${FREE_SESSION_COOKIE}=([^;]+)`));
  if (m) jar.store.set(FREE_SESSION_COOKIE, m[1]);
  return m?.[1] ?? null;
}

beforeEach(() => {
  jar.store.clear();
  clerk.state.privateMetadata = {};
  resetFreeRunsMemory();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("ADMIN_EMAILS", "op@example.com");
  vi.stubEnv("FREE_MONTHLY_LIMIT", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("固定リンク", () => {
  it("誰が開いても Cookie を置いて / へ送り、以後 requireFreeAccess が通る。診断を終えると戻る", async () => {
    const { GET } = await import("@/app/free/route");
    const { POST: logout } = await import("@/app/api/free/logout/route");
    const { requireFreeAccess, hasFreeAccess, freeLinkUrl } = await import("@/lib/free/access");

    expect(freeLinkUrl()).toMatch(/\/free$/);
    expect(await hasFreeAccess()).toBe(false);
    const denied = await requireFreeAccess();
    expect(denied?.status).toBe(401);
    expect((await denied!.json()).code).toBe("free_link");

    const res = await GET();
    expect(res.status).toBe(302);
    // 相対パス（絶対 URL だと本番で別のホストに飛び、Cookie が届かない。利用者の報告 2026-10-02）
    expect(res.headers.get("location")).toBe("/");
    expect(adoptCookie(res)).toBe("1");
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await requireFreeAccess()).toBeNull();

    await logout();
    expect(jar.store.has(FREE_SESSION_COOKIE)).toBe(false);
    expect(await hasFreeAccess()).toBe(false);
  });

  it("Cookie の値を細工しても通らない", async () => {
    const { hasFreeAccess } = await import("@/lib/free/access");
    jar.store.set(FREE_SESSION_COOKIE, "yes");
    expect(await hasFreeAccess()).toBe(false);
  });

  it("Clerk が無い環境（開発・E2E）では判定が素通り", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    const { requireFreeAccess } = await import("@/lib/free/access");
    expect(await requireFreeAccess()).toBeNull();
  });
});

describe("月の回数（Clerk の運用者の privateMetadata に残す）", () => {
  it("既定は 50 回。数えた分だけ減り、上限で 429。翌月に戻る", async () => {
    const { checkFreeRun, recordFreeRun, freeRunsThisMonth, recentFreeRuns } = await import("@/lib/free/monthly");
    const now = new Date("2026-10-15T03:00:00Z");
    let runs = await freeRunsThisMonth(now);
    expect(runs).toMatchObject({ month: "2026-10", used: 0, limit: 50, remaining: 50, resetsOn: "2026-11-01", source: "clerk" });

    await recordFreeRun("free-page", "https://example.com/", "1.1.1.1", now);
    await recordFreeRun("free-meo", "〇〇歯科", null, now);
    runs = await freeRunsThisMonth(now);
    expect(runs.used).toBe(2);
    expect(runs.remaining).toBe(48);
    expect(await checkFreeRun(now)).toBeNull();
    // Clerk 側に残っている（別のインスタンスから読んでも同じ数になる）
    expect((clerk.state.privateMetadata.freeRuns as { used: number }).used).toBe(2);

    const recent = await recentFreeRuns(10, now);
    expect(recent.records.map((r) => r.target)).toEqual(["〇〇歯科", "https://example.com/"]);
    expect(recent.records[0]).toMatchObject({ kind: "free-meo", ip: null });

    vi.stubEnv("FREE_MONTHLY_LIMIT", "2");
    const over = await checkFreeRun(now);
    expect(over?.status).toBe(429);
    const body = await over!.json();
    expect(body.code).toBe("free_monthly");
    expect(body.error).toContain("2026 年 11 月 1 日");

    // 翌月は 0 から
    expect((await freeRunsThisMonth(new Date("2026-11-02T00:00:00Z"))).used).toBe(0);
  });

  it("記録は最新 20 件だけ残し、回数は全部数える", async () => {
    const { recordFreeRun, recentFreeRuns, RECORDS_KEEP } = await import("@/lib/free/monthly");
    const now = new Date("2026-10-15T03:00:00Z");
    for (let i = 0; i < 25; i++) await recordFreeRun("free-page", `https://example.com/${i}`, null, now);
    const { runs, records } = await recentFreeRuns(100, now);
    expect(runs.used).toBe(25);
    expect(records).toHaveLength(RECORDS_KEEP);
    expect(records[0].target).toBe("https://example.com/24");
  });

  it("運用者が Clerk に居なければメモリで数える（記録先 memory）", async () => {
    vi.stubEnv("ADMIN_EMAILS", "nobody@example.com");
    const { freeRunsThisMonth, recordFreeRun } = await import("@/lib/free/monthly");
    const now = new Date("2026-10-15T03:00:00Z");
    await recordFreeRun("free-page", "https://example.com/", null, now);
    const runs = await freeRunsThisMonth(now);
    expect(runs).toMatchObject({ used: 1, source: "memory" });
  });

  it("GET /api/free/quota は固定リンクの Cookie が要る", async () => {
    const { GET } = await import("@/app/api/free/quota/route");
    expect((await GET()).status).toBe(401);
    const { GET: link } = await import("@/app/free/route");
    adoptCookie(await link());
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).limit).toBe(50);
  });
});
