/**
 * 平均順位・日別系列（§18.2）。未取得の日と圏外の扱いが要。ネットワークには出ない。
 */
import { describe, expect, it } from "vitest";
import type { RankKeyword, RankSnapshot } from "@/lib/rank/store";
import {
  averageByBucket,
  averageRank,
  DEFAULT_OUT_OF_RANGE_RANK,
  formatAverageRank,
  rankDailySeries,
  type RankDailyPoint,
} from "../series";

function keyword(id: string, monthlyVolume: number | null): RankKeyword {
  return {
    id,
    projectId: "p1",
    keyword: `kw-${id}`,
    device: "desktop",
    ...(monthlyVolume === null ? {} : { monthlyVolume }),
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function snapshot(keywordId: string, takenOn: string, rank: number | null): RankSnapshot {
  return {
    keywordId,
    takenOn,
    measuredAt: `${takenOn}T03:00:00.000Z`,
    rank,
    url: rank === null ? null : `https://example.com/${keywordId}`,
    title: null,
    competitors: [],
    aiOverview: { present: false, selfCited: false, competitorCited: false, references: [] },
    features: [],
  };
}

describe("averageRank", () => {
  it("圏外を既定の 101 位として平均する", () => {
    const result = averageRank([1, 3, null]);
    expect(DEFAULT_OUT_OF_RANGE_RANK).toBe(101);
    expect(result.value).toBeCloseTo((1 + 3 + 101) / 3, 6);
    expect(result.measured).toBe(3);
    expect(result.outOfRange).toBe(1);
    expect(result.missing).toBe(0);
  });

  it("圏外の値は設定で変えられる", () => {
    expect(averageRank([1, null], 51).value).toBeCloseTo(26, 6);
  });

  it("圏外を除外する設定では平均から外し、件数だけ残す", () => {
    const result = averageRank([2, 4, null], null);
    expect(result.value).toBeCloseTo(3, 6);
    expect(result.measured).toBe(2);
    expect(result.outOfRange).toBe(1);
  });

  it("未取得（undefined）は平均に含めない", () => {
    const result = averageRank([10, undefined, undefined]);
    expect(result.value).toBe(10);
    expect(result.measured).toBe(1);
    expect(result.missing).toBe(2);
  });

  it("全部未取得なら null（0 位ではない）", () => {
    const result = averageRank([undefined, undefined]);
    expect(result.value).toBeNull();
    expect(result.missing).toBe(2);
  });

  it("全部圏外かつ圏外を除外する設定なら null", () => {
    expect(averageRank([null, null], null).value).toBeNull();
  });

  it("空配列は null", () => {
    expect(averageRank([]).value).toBeNull();
  });
});

describe("rankDailySeries", () => {
  const keywords = [keyword("a", 1000), keyword("b", 500), keyword("c", null)];
  const snapshots = [
    snapshot("a", "2026-09-01", 1),
    snapshot("b", "2026-09-01", 3),
    snapshot("c", "2026-09-01", 20),
    // 9/02 は a だけ計測（穴あき）
    snapshot("a", "2026-09-02", null),
    snapshot("a", "2026-09-03", 2),
    snapshot("b", "2026-09-03", null),
  ];

  it("日ごとに平均順位とファインダビリティスコアを出す", () => {
    const points = rankDailySeries(keywords, snapshots);
    expect(points.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);

    // 9/01: 平均 (1 + 3 + 20) / 3、スコアは月間検索数のある a・b だけ
    expect(points[0].averageRank).toBeCloseTo(8, 6);
    expect(points[0].measured).toBe(3);
    expect(points[0].excludedVolume).toBe(1);
    // (1000×0.28 + 500×0.11) / 1500 × 100
    expect(points[0].findability).toBeCloseTo(((1000 * 0.28 + 500 * 0.11) / 1500) * 100, 6);
  });

  it("計測していないキーワードはその日の平均に含めない", () => {
    const points = rankDailySeries(keywords, snapshots);
    // 9/02 は a のみ、しかも圏外 → 101 位、スコア 0
    expect(points[1].measured).toBe(1);
    expect(points[1].averageRank).toBe(101);
    expect(points[1].outOfRange).toBe(1);
    expect(points[1].findability).toBe(0);
  });

  it("圏外の扱いを変えると平均が変わる（スコアは変わらない）", () => {
    const excluded = rankDailySeries(keywords, snapshots, { outOfRangeValue: null });
    expect(excluded[1].averageRank).toBeNull();
    expect(excluded[1].findability).toBe(0);
    expect(excluded[2].averageRank).toBe(2);
  });

  it("期間で絞り込める", () => {
    const points = rankDailySeries(keywords, snapshots, {
      startDate: "2026-09-02",
      endDate: "2026-09-02",
    });
    expect(points.map((p) => p.date)).toEqual(["2026-09-02"]);
  });

  it("登録キーワードに無いスナップショットは無視する", () => {
    const points = rankDailySeries([keyword("a", 100)], [...snapshots, snapshot("zzz", "2026-09-10", 1)]);
    expect(points.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("スナップショットが無ければ点を作らない", () => {
    expect(rankDailySeries(keywords, [])).toEqual([]);
  });

  it("月間検索数が 1 件も無ければスコアは null", () => {
    const points = rankDailySeries([keyword("c", null)], [snapshot("c", "2026-09-01", 5)]);
    expect(points[0].findability).toBeNull();
    expect(points[0].excludedVolume).toBe(1);
    expect(points[0].averageRank).toBe(5);
  });
});

describe("averageByBucket", () => {
  const points: RankDailyPoint[] = [
    { date: "2026-09-01", averageRank: 10, findability: 20, measured: 1, outOfRange: 0, excludedVolume: 0 },
    { date: "2026-09-02", averageRank: 20, findability: null, measured: 1, outOfRange: 0, excludedVolume: 0 },
    { date: "2026-09-08", averageRank: 5, findability: 40, measured: 1, outOfRange: 0, excludedVolume: 0 },
  ];

  it("日単位ならそのままの値、点の無いバケットは null", () => {
    const values = averageByBucket(points, ["2026-09-01", "2026-09-02", "2026-09-03"], "day", (p) => p.averageRank);
    expect(values).toEqual([10, 20, null]);
  });

  it("週単位は同じ週の平均になる（月曜始まり）", () => {
    // 2026-09-01 は火曜 → 週キーは 2026-08-31、9/08 は次の週 2026-09-07
    const values = averageByBucket(points, ["2026-08-31", "2026-09-07"], "week", (p) => p.averageRank);
    expect(values[0]).toBeCloseTo(15, 6);
    expect(values[1]).toBe(5);
  });

  it("null の値は平均に含めない", () => {
    const values = averageByBucket(points, ["2026-08-31"], "week", (p) => p.findability);
    expect(values[0]).toBe(20);
  });
});

describe("formatAverageRank", () => {
  it("小数 1 桁、null は —", () => {
    expect(formatAverageRank(8)).toBe("8.0");
    expect(formatAverageRank(null)).toBe("—");
  });
});
