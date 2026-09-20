import { describe, expect, it } from "vitest";
import { rankSeriesFromReports } from "../rank-history";

const report = (generatedAt: string, keywords: { keyword: string; rank: number | null; error?: string | null }[]) => ({
  generatedAt,
  rank: {
    center: { lat: 0, lng: 0 },
    radiusM: 3000,
    limit: 20,
    keywords: keywords.map((k) => ({ keyword: k.keyword, rank: k.rank, top: [], competitors: [], total: 20, measuredAt: generatedAt, error: k.error ?? null })),
  },
});

describe("マップ検索順位の推移", () => {
  it("報告書を日付順に並べ、語ごとの系列にする（取得失敗は null）", () => {
    const h = rankSeriesFromReports([
      report("2026-09-14T20:05:00Z", [{ keyword: "美容院 渋谷", rank: 3 }]),
      report("2026-09-07T20:05:00Z", [{ keyword: "美容院 渋谷", rank: 5 }, { keyword: "カット", rank: null, error: "上限" }]),
    ]);
    expect(h.dates).toEqual(["2026-09-08", "2026-09-15"]);
    expect(h.limit).toBe(20);
    expect(h.series).toEqual([
      { keyword: "美容院 渋谷", points: [{ date: "2026-09-08", rank: 5 }, { date: "2026-09-15", rank: 3 }] },
      { keyword: "カット", points: [{ date: "2026-09-08", rank: null }, { date: "2026-09-15", rank: null }] },
    ]);
  });

  it("順位の無い報告書は無視", () => {
    expect(rankSeriesFromReports([{ generatedAt: "2026-09-14T20:05:00Z", rank: null }])).toEqual({ limit: 20, series: [], dates: [] });
  });
});
