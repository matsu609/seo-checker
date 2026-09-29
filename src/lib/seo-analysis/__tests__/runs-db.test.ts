/**
 * 実行記録（analysis_runs）の問い合わせの形（2026-09-29）。
 *
 * 月の回数は行を受け取って数えず、データベースに数えさせる（Supabase は 1 回の応答を 1,000 行で
 * 切るので、`limit=1000` で受け取ると 1,000 回を超えた月に黙って 1,000 になる）。
 * 直前の診断の絞り込みは db/filters の部品で組み立て、全利用者の最新の行はページに分けて読む。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countThisMonth, listLatestRunsAllUsers, previousRun } from "../runs";

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
const init = (i = 0) => fetchMock.mock.calls[i]![1] as RequestInit;

describe("countThisMonth", () => {
  it("HEAD + count=exact で総数を受け取る（1,000 行で切られない）", async () => {
    fetchMock = vi.fn(async () => new Response(null, { status: 200, headers: { "content-range": "*/1234" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(countThisMonth("user_1", new Date("2026-09-15T00:00:00Z"))).resolves.toBe(1234);
    expect(init().method).toBe("HEAD");
    expect((init().headers as Record<string, string>).prefer).toBe("count=exact");
    expect(url()).toContain("analysis_runs?select=id&user_id=eq.user_1&status=neq.failed&created_at=gte.2026-08-31T15%3A00%3A00.000Z");
    expect(url()).not.toContain("limit=");
  });
});

describe("previousRun", () => {
  it("日時の未満と自分の id の除外を db/filters の部品で組み立てる", async () => {
    fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    await expect(previousRun("user_1", "https://example.test", "2026-09-10T00:00:00Z", "run-1")).resolves.toBeNull();
    expect(url()).toContain("user_id=eq.user_1");
    expect(url()).toContain("origin=eq.https%3A%2F%2Fexample.test");
    expect(url()).toContain("created_at=lt.2026-09-10T00%3A00%3A00Z");
    expect(url()).toContain("id=not.in.(%22run-1%22)");
    expect(url()).toContain("order=created_at.desc&limit=1");
  });
});

describe("listLatestRunsAllUsers", () => {
  it("1,000 行を超える分もページに分けて読む（以前は limit=2000 が 1,000 行で黙って切れていた）", async () => {
    const row = (i: number) => ({ user_id: `u${i}`, origin: "https://example.test", status: "collected", created_at: "2026-09-01T00:00:00Z", input: {} });
    fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(Array.from({ length: 1000 }, (_, i) => row(i))))
      .mockResolvedValueOnce(Response.json([row(1000), row(1001), row(1002)]));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await listLatestRunsAllUsers();
    expect(rows).toHaveLength(1003);
    expect(rows[1002]?.userId).toBe("u1002");
    expect(url(0)).toContain("order=created_at.desc,id.desc&limit=1000");
    expect(url(0)).not.toContain("offset=");
    expect(url(1)).toContain("limit=1000&offset=1000");
  });
});
