/**
 * 基本情報の保存: 行の変換と、user_id で絞ること・upsert の形。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromListingRow, getListing, listListings, putListing } from "../store";
import { emptyProfile } from "../profile";

const ROW = { user_id: "user_1", place_id: "ChIJx", profile: { name: "A" }, states: { BING: { status: "live" } }, updated_at: "2026-09-11T00:00:00Z" };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
  fetchMock = vi.fn(async () => Response.json([ROW]));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("基本情報の保存", () => {
  it("行 → 記録（壊れた部分は既定値）", () => {
    const r = fromListingRow(ROW);
    expect(r.profile.name).toBe("A");
    expect(r.profile.phone).toBe("");
    expect(r.states.BING?.status).toBe("live");
    expect(r.states.BING?.url).toBe("");
    expect(fromListingRow({ ...ROW, profile: "broken", states: 1 })).toMatchObject({ profile: emptyProfile(), states: {} });
  });

  it("一覧と 1 件は user_id で絞る", async () => {
    await listListings("user_1");
    expect(fetchMock.mock.calls[0]![0]).toContain("user_id=eq.user_1");
    await getListing("user_1", "ChIJx");
    expect(fetchMock.mock.calls[1]![0]).toContain("user_id=eq.user_1");
    expect(fetchMock.mock.calls[1]![0]).toContain("place_id=eq.ChIJx");
  });

  it("保存は upsert（on_conflict）で user_id を本文に入れる", async () => {
    await putListing("user_1", "ChIJx", { ...emptyProfile(), name: "A" }, {});
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain("on_conflict=user_id,place_id");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).prefer).toContain("merge-duplicates");
    expect(JSON.parse(init.body as string)).toMatchObject({ user_id: "user_1", place_id: "ChIJx", profile: { name: "A" } });
  });
});
