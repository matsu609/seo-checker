/**
 * 無料診断の専用リンク（GET /free/<トークン>・GET /free・requireFreeAccess）と月の回数（利用者の決定 2026-10-02）。
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

const admin = vi.hoisted(() => ({ isAdmin: vi.fn(async () => false) }));
vi.mock("@/lib/admin/guard", () => admin);

import { resetFreeRunsMemory } from "@/lib/free/monthly";
import { resetFreeLimits } from "@/lib/free/ratelimit";
import { FREE_SESSION_COOKIE, freeLinkToken } from "@/lib/free/session-rules";

const SECRET = "sk_test_secret_value";

function get(path: string, ip = "1.1.1.1"): Request {
  return new Request(`http://localhost${path}`, { headers: { "x-forwarded-for": ip } });
}

/** Set-Cookie から値を取り出して、次のリクエストの Cookie にする */
function adoptCookie(res: Response) {
  const header = res.headers.get("set-cookie") ?? "";
  const m = header.match(new RegExp(`${FREE_SESSION_COOKIE}=([^;]+)`));
  if (m) jar.store.set(FREE_SESSION_COOKIE, m[1]);
  return m?.[1] ?? null;
}

beforeEach(() => {
  jar.store.clear();
  resetFreeLimits();
  resetFreeRunsMemory();
  admin.isAdmin.mockReset();
  admin.isAdmin.mockResolvedValue(false);
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", SECRET);
  vi.stubEnv("FREE_LINK_SECRET", "");
  vi.stubEnv("SUPABASE_URL", "");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  vi.stubEnv("FREE_MONTHLY_LIMIT", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("専用リンク", () => {
  it("正しいトークンなら Cookie を置いて / へ送り、以後 requireFreeAccess が通る。診断を終えると戻る", async () => {
    const { GET } = await import("@/app/free/[token]/route");
    const { POST: logout } = await import("@/app/api/free/logout/route");
    const { requireFreeAccess, hasFreeAccess, freeLinkPath } = await import("@/lib/free/access");

    expect(await hasFreeAccess()).toBe(false);
    const denied = await requireFreeAccess();
    expect(denied?.status).toBe(401);
    expect((await denied!.json()).code).toBe("free_link");

    const token = await freeLinkToken(SECRET);
    expect(await freeLinkPath()).toBe(`/free/${token}`);
    const res = await GET(get(`/free/${token}`), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(302);
    // 相対パス（絶対 URL だと本番で別のホストに飛び、Cookie が届かない。利用者の報告 2026-10-02）
    expect(res.headers.get("location")).toBe("/");
    expect(adoptCookie(res)).toMatch(/^\d+\./);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(await requireFreeAccess()).toBeNull();

    await logout();
    expect(jar.store.has(FREE_SESSION_COOKIE)).toBe(false);
    expect(await hasFreeAccess()).toBe(false);
  });

  it("違うトークンは 404 で Cookie を置かない。IP ごとに 10 分で 20 回を超えると 429", async () => {
    const { GET } = await import("@/app/free/[token]/route");
    const bad = await GET(get("/free/nope"), { params: Promise.resolve({ token: "nope" }) });
    expect(bad.status).toBe(404);
    expect(bad.headers.get("set-cookie")).toBeNull();
    for (let i = 0; i < 20; i++) await GET(get("/free/x", "2.2.2.2"), { params: Promise.resolve({ token: "x" }) });
    const token = await freeLinkToken(SECRET);
    expect((await GET(get(`/free/${token}`, "2.2.2.2"), { params: Promise.resolve({ token }) })).status).toBe(429);
    expect((await GET(get(`/free/${token}`, "3.3.3.3"), { params: Promise.resolve({ token }) })).status).toBe(302);
  });

  it("FREE_LINK_SECRET を変えると、リンクも配り済みの Cookie も無効になる", async () => {
    const { GET } = await import("@/app/free/[token]/route");
    const { hasFreeAccess, freeLinkPath } = await import("@/lib/free/access");
    const token = await freeLinkToken(SECRET);
    adoptCookie(await GET(get(`/free/${token}`), { params: Promise.resolve({ token }) }));
    expect(await hasFreeAccess()).toBe(true);
    vi.stubEnv("FREE_LINK_SECRET", "rotated");
    expect(await hasFreeAccess()).toBe(false);
    expect(await freeLinkPath()).not.toBe(`/free/${token}`);
    expect((await GET(get(`/free/${token}`), { params: Promise.resolve({ token }) })).status).toBe(404);
  });

  it("運用者の入口 /free は Clerk の運用者だけ。お客様は 404", async () => {
    const { GET } = await import("@/app/free/route");
    expect((await GET()).status).toBe(404);
    admin.isAdmin.mockResolvedValue(true);
    const res = await GET();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/");
    expect(adoptCookie(res)).toMatch(/^\d+\./);
  });

  it("秘密も Clerk も無い環境（開発・E2E）では判定が素通り。FREE_LINK_SECRET だけでも閉じる", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    const { requireFreeAccess, freeLinkUrl } = await import("@/lib/free/access");
    expect(await freeLinkUrl()).toBeNull();
    expect(await requireFreeAccess()).toBeNull();
    vi.stubEnv("FREE_LINK_SECRET", "only-link-secret");
    expect(await freeLinkUrl()).toMatch(/\/free\/[A-Za-z0-9_-]{24}$/);
    expect((await requireFreeAccess())?.status).toBe(401);
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

  it("GET /api/free/quota は専用リンクの Cookie が要る", async () => {
    const { GET } = await import("@/app/api/free/quota/route");
    expect((await GET()).status).toBe(401);
    const { GET: link } = await import("@/app/free/[token]/route");
    const token = await freeLinkToken(SECRET);
    adoptCookie(await link(get(`/free/${token}`), { params: Promise.resolve({ token }) }));
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).limit).toBe(50);
  });
});
