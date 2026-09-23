/**
 * 1,000 行を超える一覧と件数（2026-09-23）。
 *
 * Supabase（PostgREST）は 1 回の応答を既定で 1,000 行に切る。`limit=2000` と頼んでも 1,000 行しか
 * 返らず、エラーにもならないので「黙って欠ける」。ページに分けて読むこと・件数はデータベースに
 * 数えさせることを、ネットワークに出ずに確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DB_PAGE_SIZE, selectAllPages, supabaseCount, totalFromContentRange } from "../supabase";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** 全 total 行のテーブルを、limit / offset どおりに（ただし 1 回 1,000 行まで）返す偽の PostgREST */
function fakeTable(total: number, cap = DB_PAGE_SIZE) {
  fetchMock = vi.fn(async (url: string) => {
    const u = new URL(url);
    const limit = Number(u.searchParams.get("limit") ?? "1000000");
    const offset = Number(u.searchParams.get("offset") ?? "0");
    const n = Math.max(0, Math.min(limit, cap, total - offset));
    return Response.json(Array.from({ length: n }, (_, i) => ({ id: offset + i })));
  });
  vi.stubGlobal("fetch", fetchMock);
}

const urls = () => fetchMock.mock.calls.map((c) => (c[0] as string).replace("https://example.supabase.co/rest/v1/", ""));

describe("selectAllPages", () => {
  it("1,000 行を超える分もページに分けて最後まで読む（以前は 1,000 行で黙って切れていた）", async () => {
    fakeTable(2345);
    const rows = await selectAllPages("meo_stores?select=id&order=id.asc", { max: 5000 });
    expect(rows).toHaveLength(2345);
    expect((rows as { id: number }[]).map((r) => r.id)).toEqual(Array.from({ length: 2345 }, (_, i) => i));
    expect(urls()).toEqual([
      "meo_stores?select=id&order=id.asc&limit=1000",
      "meo_stores?select=id&order=id.asc&limit=1000&offset=1000",
      "meo_stores?select=id&order=id.asc&limit=1000&offset=2000",
    ]);
  });

  it("max で打ち切る。最後のページは残りの行数だけ頼む", async () => {
    fakeTable(5000);
    const rows = await selectAllPages("t?select=id&order=id.asc", { max: 1200 });
    expect(rows).toHaveLength(1200);
    expect(urls()).toEqual(["t?select=id&order=id.asc&limit=1000", "t?select=id&order=id.asc&limit=200&offset=1000"]);
  });

  it("1 ページに収まれば 1 回だけ（ちょうど上限の行数でも、次の空ページで終わる）", async () => {
    fakeTable(10);
    await expect(selectAllPages("t?select=id&order=id.asc", { max: 500 })).resolves.toHaveLength(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fakeTable(1000);
    await expect(selectAllPages("t?select=id&order=id.asc", { max: 5000 })).resolves.toHaveLength(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("配列でない応答は upstream のエラー", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "x" })));
    await expect(selectAllPages("t?select=id&order=id.asc", { max: 10 })).rejects.toMatchObject({ code: "upstream" });
  });
});

describe("supabaseCount", () => {
  it("HEAD + Prefer: count=exact で総数だけを受け取る", async () => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { "content-range": "*/1234" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(supabaseCount("gbp_posts?select=id&user_id=eq.u1&status=eq.scheduled")).resolves.toBe(1234);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/gbp_posts?select=id&user_id=eq.u1&status=eq.scheduled");
    expect(init.method).toBe("HEAD");
    expect((init.headers as Record<string, string>).prefer).toBe("count=exact");
  });

  it("Content-Range が無ければ upstream のエラー（0 件と取り違えない）", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 200 })));
    await expect(supabaseCount("t?select=id")).rejects.toMatchObject({ code: "upstream" });
  });

  it("Content-Range の読み取り", () => {
    expect(totalFromContentRange("0-24/3573")).toBe(3573);
    expect(totalFromContentRange("*/0")).toBe(0);
    expect(totalFromContentRange("0-24/*")).toBeNull();
    expect(totalFromContentRange(null)).toBeNull();
  });
});

describe("件数・一覧を使う側", () => {
  it("投稿の件数は行を受け取らずに数える（1,000 件で頭打ちにならない）", async () => {
    fetchMock = vi.fn(async () => new Response(null, { status: 206, headers: { "content-range": "*/1500" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { countPublishedBetween, countScheduled } = await import("@/lib/posts/store");
    await expect(countPublishedBetween("u1", "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z")).resolves.toBe(1500);
    await expect(countScheduled("u1")).resolves.toBe(1500);
    expect(urls()[0]).toBe(
      "gbp_posts?select=id&user_id=eq.u1&status=eq.published&published_at=gte.2026-08-01T00%3A00%3A00.000Z&published_at=lt.2026-09-01T00%3A00%3A00.000Z",
    );
  });

  it("お知らせの種類ごとの件数は 1,000 件を超えても全部数える", async () => {
    fetchMock = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      const n = Math.max(0, Math.min(1000, 1500 - offset));
      return Response.json(Array.from({ length: n }, (_, i) => ({ kind: (offset + i) % 3 === 0 ? "rank_drop" : "site_incident" })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { countNotificationsBetween } = await import("@/lib/notifications/store");
    const counts = await countNotificationsBetween("u1", "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    expect(counts).toEqual({ rank_drop: 500, site_incident: 1000 });
    expect(urls()[0]).toContain("created_at=lt.2026-09-01T00%3A00%3A00.000Z");
  });

  it("月次レポートの対象者は全行を読んでから重複を除く", async () => {
    fetchMock = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      const n = Math.max(0, Math.min(1000, 1800 - offset));
      // 先頭の 1,500 行は店舗の多い 1 人、残りは別の 3 人
      return Response.json(Array.from({ length: n }, (_, i) => ({ user_id: offset + i < 1500 ? "big" : `u${(offset + i) % 3}` })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { listOwnStoreUserIds } = await import("@/lib/maps/stores");
    await expect(listOwnStoreUserIds()).resolves.toEqual(["big", "u0", "u1", "u2"]);
  });
});
