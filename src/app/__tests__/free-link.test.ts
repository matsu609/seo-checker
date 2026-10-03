/**
 * 無料診断の固定リンク（GET /free・requireFreeAccess）と月の回数（利用者の決定 2026-10-02 → 10-03）。
 *
 * next/headers の cookies() を差し替えて、リンクで置いた Cookie がそのまま判定に通ることを見る。
 * Supabase は未設定にして、月の回数はメモリの控えで数える。
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
  resetFreeRunsMemory();
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
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

describe("月の回数（Supabase が無いのでメモリで数える）", () => {
  it("既定は 50 回。数えた分だけ減り、上限で 429。翌月に戻る", async () => {
    const { checkFreeRun, recordFreeRun, freeRunsThisMonth, recentFreeRuns } = await import("@/lib/free/monthly");
    const now = new Date("2026-10-15T03:00:00Z");
    let runs = await freeRunsThisMonth(now);
    expect(runs).toMatchObject({ month: "2026-10", used: 0, limit: 50, remaining: 50, resetsOn: "2026-11-01", source: "memory" });

    await recordFreeRun("free-page", "https://example.com/", "1.1.1.1", now);
    await recordFreeRun("free-meo", "〇〇歯科", null, now);
    runs = await freeRunsThisMonth(now);
    expect(runs.used).toBe(2);
    expect(runs.remaining).toBe(48);
    expect(await checkFreeRun(now)).toBeNull();

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
