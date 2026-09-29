/**
 * クレジットの消費履歴（geo_credit_ledger）の読み方（2026-09-29）。
 *
 * `limit=5000` を 1 回で頼んでいたが、Supabase は 1 回の応答を 1,000 行で切るので、
 * 消費が多い月は合計が少なく出ていた。ページに分けて最後まで読むことを確かめる。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listLedger } from "../store";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const url = (i = 0) => (fetchMock.mock.calls[i]![0] as string).replace("https://example.supabase.co/rest/v1/", "");

describe("listLedger", () => {
  it("1,000 行を超える分もページに分けて読む", async () => {
    const row = (i: number) => ({ id: `l${i}`, action: "measure", credits: 1, measurement_id: null, cache_hit: false, created_at: "2026-09-01T00:00:00Z" });
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(Array.from({ length: 1000 }, (_, i) => row(i))))
      .mockResolvedValueOnce(Response.json([row(1000), row(1001)]));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await listLedger("user_1", "2026-08-31T15:00:00.000Z");
    expect(rows).toHaveLength(1002);
    expect(rows[1001]).toMatchObject({ id: "l1001", action: "measure", credits: 1, cacheHit: false });
    expect(url(0)).toContain("user_id=eq.user_1&created_at=gte.2026-08-31T15%3A00%3A00.000Z&order=created_at.desc,id.desc&limit=1000");
    expect(url(1)).toContain("limit=1000&offset=1000");
  });

  it("1,000 行未満なら 1 回で終わる", async () => {
    fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listLedger("user_1", "2026-08-31T15:00:00.000Z")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
