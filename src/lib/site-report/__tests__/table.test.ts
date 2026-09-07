/**
 * 最新の検索順位表（§18.3）のトレンド区分・競合列・絞り込み・CSV。
 */
import { describe, expect, it } from "vitest";
import { buildRankRows } from "@/lib/rank/rows";
import type { RankKeyword, RankSnapshot } from "@/lib/rank/store";
import { toCsv } from "@/lib/export/csv";
import {
  TREND_LABELS,
  buildCsvColumns,
  buildSiteReportRows,
  classifyTrend,
  competitorDomains,
  countByTrend,
  filterByTrend,
} from "../table";

function keyword(id: string, monthlyVolume?: number): RankKeyword {
  return {
    id,
    projectId: "p1",
    keyword: `kw-${id}`,
    device: "desktop",
    ...(monthlyVolume === undefined ? {} : { monthlyVolume }),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function snapshot(
  keywordId: string,
  takenOn: string,
  rank: number | null,
  competitors: Array<{ domain: string; rank: number | null }> = [],
): RankSnapshot {
  return {
    keywordId,
    takenOn,
    measuredAt: `${takenOn}T03:00:00.000Z`,
    rank,
    url: rank === null ? null : `https://example.com/${keywordId}`,
    title: null,
    competitors: competitors.map((c) => ({ ...c, url: null, title: null })),
    aiOverview: { present: false, selfCited: false, competitorCited: false, references: [] },
    features: [],
  };
}

describe("classifyTrend", () => {
  it("順位が上がれば上昇、下がれば下降", () => {
    expect(classifyTrend(3, 8)).toBe("up");
    expect(classifyTrend(8, 3)).toBe("down");
  });

  it("同じ順位なら横ばい", () => {
    expect(classifyTrend(5, 5)).toBe("flat");
  });

  it("圏外からのランクインは上昇", () => {
    expect(classifyTrend(20, null)).toBe("up");
  });

  it("最新が圏外なら、前回が何位でも圏外", () => {
    expect(classifyTrend(null, 5)).toBe("out");
    expect(classifyTrend(null, null)).toBe("out");
    expect(classifyTrend(null, undefined)).toBe("out");
  });

  it("最新が未取得なら比較なし、前回が未取得でも比較なし", () => {
    expect(classifyTrend(undefined, 5)).toBe("unknown");
    expect(classifyTrend(5, undefined)).toBe("unknown");
  });
});

describe("buildSiteReportRows", () => {
  const keywords = [keyword("a", 1000), keyword("b", 500), keyword("c")];
  const snapshots = [
    snapshot("a", "2026-09-01", 8, [{ domain: "rival.example", rank: 2 }]),
    snapshot("a", "2026-09-02", 3, [
      { domain: "rival.example", rank: 4 },
      { domain: "other.example", rank: null },
    ]),
    snapshot("b", "2026-09-01", 12),
    snapshot("b", "2026-09-02", null),
  ];
  const rows = buildSiteReportRows(buildRankRows(keywords, snapshots, []));

  it("最新と 1 つ前を比べてトレンドを付ける", () => {
    const a = rows.find((r) => r.keyword.id === "a");
    expect(a?.currentRank).toBe(3);
    expect(a?.previousRank).toBe(8);
    expect(a?.trend).toBe("up");

    const b = rows.find((r) => r.keyword.id === "b");
    expect(b?.trend).toBe("out");

    // 一度も計測していないキーワードは「比較なし」
    expect(rows.find((r) => r.keyword.id === "c")?.trend).toBe("unknown");
  });

  it("月間検索数とスコアへの寄与（月間検索数 × CTR）を持つ", () => {
    const a = rows.find((r) => r.keyword.id === "a");
    expect(a?.volume).toBe(1000);
    expect(a?.weighted).toBeCloseTo(1000 * 0.11, 6);
    // 未登録は null（0 ではない）
    expect(rows.find((r) => r.keyword.id === "c")?.weighted).toBeNull();
  });

  it("最新スナップショットの競合順位を列に展開する", () => {
    const a = rows.find((r) => r.keyword.id === "a");
    expect(a?.competitors).toEqual({ "rival.example": 4, "other.example": null });
    expect(competitorDomains(rows)).toEqual(["other.example", "rival.example"]);
  });

  it("トレンドで絞り込め、件数も数えられる", () => {
    expect(filterByTrend(rows, "all")).toHaveLength(3);
    expect(filterByTrend(rows, "up").map((r) => r.keyword.id)).toEqual(["a"]);
    expect(filterByTrend(rows, "out").map((r) => r.keyword.id)).toEqual(["b"]);
    expect(filterByTrend(rows, "flat")).toEqual([]);
    expect(countByTrend(rows)).toEqual({ up: 1, flat: 0, down: 0, out: 1, unknown: 1 });
  });

  it("CSV は競合列を任意で足せる", () => {
    const csv = toCsv(buildCsvColumns(["rival.example"]), rows);
    const [header, first] = csv.split("\r\n");
    expect(header).toBe("キーワード,グループ,月間検索数,前回日,前回,最新日,最新,変化,URL,競合 rival.example");
    expect(first).toContain(TREND_LABELS.up);
    expect(first).toContain("4");
    // 競合列を渡さなければ出ない
    expect(toCsv(buildCsvColumns(), rows).split("\r\n")[0]).not.toContain("競合");
  });

  it("圏外・未取得は CSV でも文字で表す", () => {
    const csv = toCsv(buildCsvColumns(), rows).split("\r\n");
    expect(csv[2]).toContain("圏外");
    expect(csv[3]).toContain("未取得");
  });
});
