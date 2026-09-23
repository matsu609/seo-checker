/**
 * Places API のクライアント: フィールドマスク（= 料金区分）の選び方。ネットワークには出ない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "../client";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("GOOGLE_PLACES_API_KEY", "test-key");
  fetchMock = vi.fn(async () => Response.json({ places: [{ id: "ChIJx", displayName: { text: "テスト食堂" }, formattedAddress: "東京都新宿区1-1-1" }] }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const fieldMask = (i = 0) => ((fetchMock.mock.calls[i]![1] as RequestInit).headers as Record<string, string>)["X-Goog-FieldMask"];

describe("searchPlaces のフィールドマスク", () => {
  it("既定は評価・件数まで（Enterprise 区分。店舗検索の候補一覧）", async () => {
    await searchPlaces("テスト食堂");
    expect(fieldMask()).toContain("places.rating");
    expect(fieldMask()).toContain("places.userRatingCount");
  });

  it("basic は id・名前・住所だけ（Pro 区分。NAP チェックの店舗探し。2026-09-23）", async () => {
    const places = await searchPlaces("テスト食堂 東京都新宿区", 3, { fields: "basic" });
    expect(fieldMask()).toBe("places.id,places.displayName,places.formattedAddress");
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({ pageSize: 3 });
    expect(places).toEqual([{ id: "ChIJx", name: "テスト食堂", address: "東京都新宿区1-1-1", rating: null, ratingCount: null, category: null, status: expect.anything() }]);
  });
});
