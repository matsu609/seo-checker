/**
 * 登録店舗（meo_stores）のテスト。行の変換と、問い合わせが user_id で絞られていること。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addStore, fromStoreRow, getStore, listStores, listStoresDue, markRefreshed, removeStore } from "../stores";

const OWN = {
  id: "0b2f0b8e-0000-4000-8000-000000000001",
  user_id: "user_1",
  place_id: "ChIJown",
  place_name: "自社",
  own_place_id: "",
  created_at: "2026-09-10T00:00:00Z",
  last_refreshed_at: null,
};
const COMP = { ...OWN, id: "0b2f0b8e-0000-4000-8000-000000000002", place_id: "ChIJcomp", place_name: "競合", own_place_id: "ChIJown" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
  fetchMock = vi.fn(async () => Response.json([OWN]));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const url = (i = 0) => fetchMock.mock.calls[i]![0] as string;
const init = (i = 0) => fetchMock.mock.calls[i]![1] as RequestInit;

describe("行の変換", () => {
  it("own_place_id が空なら自社、あれば競合", () => {
    expect(fromStoreRow(OWN)).toMatchObject({ role: "own", ownPlaceId: "", placeId: "ChIJown", name: "自社" });
    expect(fromStoreRow(COMP)).toMatchObject({ role: "competitor", ownPlaceId: "ChIJown" });
  });
});

describe("問い合わせ", () => {
  it("一覧は user_id で絞る", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([OWN, COMP]));
    const stores = await listStores("user_1");
    expect(stores.map((s) => s.role)).toEqual(["own", "competitor"]);
    expect(url()).toContain("user_id=eq.user_1");
  });

  it("登録は二重登録を既存行にまとめる（on_conflict + merge-duplicates）", async () => {
    const store = await addStore("user_1", { placeId: "ChIJown", name: "自社", ownPlaceId: "" });
    expect(store.role).toBe("own");
    expect(init().method).toBe("POST");
    expect(url()).toContain("on_conflict=user_id,place_id,own_place_id");
    expect((init().headers as Record<string, string>).prefer).toContain("resolution=merge-duplicates");
    expect(JSON.parse(init().body as string)).toEqual({ user_id: "user_1", place_id: "ChIJown", place_name: "自社", own_place_id: "" });
  });

  it("1 件取得は user_id と id で絞る。無ければ null", async () => {
    await expect(getStore("user_1", OWN.id)).resolves.toMatchObject({ id: OWN.id });
    expect(url()).toContain(`user_id=eq.user_1`);
    expect(url()).toContain(`id=eq.${OWN.id}`);
    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(getStore("user_2", OWN.id)).resolves.toBeNull();
  });

  it("自社を外すと競合もまとめて消す", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([OWN])) // getStore
      .mockResolvedValueOnce(Response.json([{ id: OWN.id }])) // delete self
      .mockResolvedValueOnce(Response.json([{ id: COMP.id }, { id: "x" }])); // delete children
    await expect(removeStore("user_1", OWN.id)).resolves.toBe(3);
    expect(init(1).method).toBe("DELETE");
    expect(url(1)).toContain("user_id=eq.user_1");
    expect(init(2).method).toBe("DELETE");
    expect(url(2)).toContain("own_place_id=eq.ChIJown");
    expect(url(2)).toContain("user_id=eq.user_1");
  });

  it("競合を外すときは自分の行だけ", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([COMP])).mockResolvedValueOnce(Response.json([{ id: COMP.id }]));
    await expect(removeStore("user_1", COMP.id)).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("他人の行は消せない", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(removeStore("user_2", OWN.id)).resolves.toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("一斉更新の対象は全利用者を古い順に", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([OWN, COMP]));
    const rows = await listStoresDue(500);
    expect(rows).toHaveLength(2);
    expect(url()).not.toContain("user_id=");
    expect(url()).toContain("order=last_refreshed_at.asc.nullsfirst");
    expect(url()).toContain("limit=500");
  });

  it("更新日時は同じ店舗の全行に書く", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await markRefreshed("ChIJown", new Date("2026-09-14T20:00:00Z"));
    expect(init().method).toBe("PATCH");
    expect(url()).toContain("place_id=eq.ChIJown");
    expect(JSON.parse(init().body as string)).toEqual({ last_refreshed_at: "2026-09-14T20:00:00.000Z" });
  });
});
