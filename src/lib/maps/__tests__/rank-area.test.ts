/**
 * 検索順位（rank.ts）と周辺の同業（area.ts）のテスト。Google も DB も使わない。
 */
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/place.json";
import { areaError, buildArea, topPercent } from "../area";
import { parseDetailResponse, parseNearbyResponse, parseRankResponse, type NearbyPlace, type RankedPlace } from "../parse";
import { formatRank, measureRanks, rankOf, type MeoRankResult } from "../rank";

const OWN = parseDetailResponse(fixture)!;
const NOW = new Date("2026-09-14T20:00:00Z");
const CENTER = { lat: 35.6595, lng: 139.7005 };

function results(...ids: string[]): RankedPlace[] {
  return ids.map((id) => ({ id, name: `店 ${id}` }));
}

describe("応答の読み取り（順位・周辺）", () => {
  it("searchText の並びをそのまま返し、壊れた要素は捨てる", () => {
    const body = { places: [{ id: "a", displayName: { text: "A" } }, { displayName: { text: "無 id" } }, { id: "b" }] };
    expect(parseRankResponse(body)).toEqual([
      { id: "a", name: "A" },
      { id: "b", name: "（名称不明）" },
    ]);
    expect(parseRankResponse(null)).toEqual([]);
  });

  it("searchNearby は評価・件数を null 許容で読む", () => {
    const body = { places: [{ id: "a", displayName: { text: "A" }, rating: 4.2, userRatingCount: 30 }, { id: "b", displayName: { text: "B" } }] };
    expect(parseNearbyResponse(body)).toEqual([
      { id: "a", name: "A", rating: 4.2, ratingCount: 30 },
      { id: "b", name: "B", rating: null, ratingCount: null },
    ]);
  });
});

describe("検索順位", () => {
  it("並びの中の位置（1 始まり）。無ければ null", () => {
    expect(rankOf(results("x", OWN.id, "y"), OWN.id)).toBe(2);
    expect(rankOf(results("x", "y"), OWN.id)).toBeNull();
    expect(formatRank(3)).toBe("3 位");
    expect(formatRank(null)).toBe("圏外（20 位より下）");
    expect(formatRank(undefined)).toBe("—");
  });

  it("キーワードごとに 1 回検索し、自社・競合の順位と上位 3 件を記録する", async () => {
    const search = vi.fn(async (query: string) => (query === "渋谷 美容室" ? results("c1", OWN.id, "z", "c2") : results("a", "b")));
    const r = await measureRanks({
      keywords: ["渋谷 美容室", " 縮毛矯正 ", "渋谷 美容室", ""],
      ownPlaceId: OWN.id,
      competitors: [
        { placeId: "c1", name: "競合 1" },
        { placeId: "c2", name: "競合 2" },
      ],
      center: CENTER,
      search,
      now: () => NOW,
    });
    expect(search).toHaveBeenCalledTimes(2);
    expect(search).toHaveBeenCalledWith("渋谷 美容室", CENTER, 3000, 20);
    expect(r.keywords.map((k) => k.keyword)).toEqual(["渋谷 美容室", "縮毛矯正"]);
    const [k1, k2] = r.keywords;
    expect(k1.rank).toBe(2);
    expect(k1.previous).toBeUndefined();
    expect(k1.top.map((t) => t.id)).toEqual(["c1", OWN.id, "z"]);
    expect(k1.competitors).toEqual([
      { placeId: "c1", name: "競合 1", rank: 1 },
      { placeId: "c2", name: "競合 2", rank: 4 },
    ]);
    expect(k1.total).toBe(4);
    expect(k2.rank).toBeNull();
    expect(k2.error).toBeNull();
    expect(k2.measuredAt).toBe(NOW.toISOString());
  });

  it("前回の結果を使い回し（同じキーワードは検索しない）、前回の順位を previous に入れる", async () => {
    const previous: MeoRankResult = {
      center: CENTER,
      radiusM: 3000,
      limit: 20,
      keywords: [
        { keyword: "渋谷 美容室", rank: 5, top: [], competitors: [], total: 20, measuredAt: "2026-09-07T20:00:00Z", error: null },
        { keyword: "失敗した語", rank: null, top: [], competitors: [], total: 0, measuredAt: "2026-09-07T20:00:00Z", error: "上限" },
      ],
    };
    const search = vi.fn(async () => results(OWN.id));
    const reused = await measureRanks({ keywords: ["渋谷 美容室", "失敗した語", "新しい語"], ownPlaceId: OWN.id, competitors: [], center: CENTER, reuse: previous, previous, search, now: () => NOW });
    // 成功していた語は使い回し、失敗していた語と新しい語だけ検索
    expect(search).toHaveBeenCalledTimes(2);
    expect(reused.keywords[0]).toMatchObject({ keyword: "渋谷 美容室", rank: 5, previous: 5, measuredAt: "2026-09-07T20:00:00Z" });
    expect(reused.keywords[1]).toMatchObject({ keyword: "失敗した語", rank: 1, previous: null, error: null });
    expect(reused.keywords[2]).toMatchObject({ keyword: "新しい語", rank: 1 });
    expect(reused.keywords[2].previous).toBeUndefined();

    // 使い回さず previous だけ渡すと、全部検索して previous が付く
    const weekly = await measureRanks({ keywords: ["渋谷 美容室"], ownPlaceId: OWN.id, competitors: [], center: CENTER, previous, search, now: () => NOW });
    expect(weekly.keywords[0]).toMatchObject({ rank: 1, previous: 5, measuredAt: NOW.toISOString() });
  });

  it("1 本の失敗は error に入れて続ける", async () => {
    const search = vi.fn(async (query: string) => {
      if (query === "b") throw new Error("上限に達しました");
      return results(OWN.id);
    });
    const r = await measureRanks({ keywords: ["a", "b", "c"], ownPlaceId: OWN.id, competitors: [{ placeId: "x", name: "X" }], center: CENTER, search });
    expect(r.keywords.map((k) => k.rank)).toEqual([1, null, 1]);
    expect(r.keywords[1].error).toBe("上限に達しました");
    expect(r.keywords[1].competitors).toEqual([{ placeId: "x", name: "X", rank: null }]);
  });
});

describe("周辺の同業", () => {
  const nearby: NearbyPlace[] = [
    { id: OWN.id, name: "自社（除外される）", rating: 4.6, ratingCount: 128 },
    { id: "a", name: "A", rating: 4.8, ratingCount: 300 },
    { id: "b", name: "B", rating: 4.6, ratingCount: 50 },
    { id: "c", name: "C", rating: 4.0, ratingCount: 900 },
    { id: "d", name: "D", rating: null, ratingCount: null },
  ];

  it("自社を除いた周辺の中での順位（同点は同順位）、平均・中央値、件数順の上位", () => {
    const a = buildArea(OWN, nearby, NOW);
    expect(a.count).toBe(4);
    expect(a.own).toEqual({ rating: 4.6, ratingCount: 128 });
    // 評価 4.6: 4.8 だけが上 → 2 位（B の 4.6 は同点）
    expect(a.ratingRank).toBe(2);
    // 件数 128: 300 と 900 が上 → 3 位
    expect(a.countRank).toBe(3);
    expect(a.avgRating).toBe(4.5);
    expect(a.medianCount).toBe(300);
    expect(a.top.map((t) => t.id)).toEqual(["c", "a", "b", "d"]);
    expect(a.primaryType).toBe("hair_salon");
    expect(a.error).toBeNull();
    expect(a.measuredAt).toBe(NOW.toISOString());
  });

  it("周辺が無ければ順位は null、自社の値が無くても落ちない", () => {
    expect(buildArea(OWN, [], NOW)).toMatchObject({ count: 0, ratingRank: null, countRank: null, avgRating: null, medianCount: null, top: [] });
    const noOwn = buildArea({ ...OWN, rating: null, ratingCount: null }, nearby, NOW);
    expect(noOwn.ratingRank).toBeNull();
    expect(noOwn.countRank).toBeNull();
    expect(noOwn.count).toBe(4);
  });

  it("失敗の形と、上位 X%", () => {
    expect(areaError(OWN, "上限", NOW)).toMatchObject({ error: "上限", count: 0, ratingRank: null });
    expect(topPercent(1, 19)).toBe(5);
    expect(topPercent(10, 19)).toBe(50);
    expect(topPercent(null, 19)).toBeNull();
    expect(topPercent(1, 0)).toBeNull();
  });
});
