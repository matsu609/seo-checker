import { describe, expect, it } from "vitest";
import type { TopicEntry } from "../normalize";
import {
  aggregateTopics,
  assignPriorities,
  COVERAGE_FACTOR,
  missingTopics,
  missingTopicsText,
  observedDates,
  priorityScore,
  splitByPeriod,
  trendFactor,
  trendSeries,
  type AioTopicDay,
} from "../aggregate";

function topic(id: string, label = id): TopicEntry {
  return { id, keyword: "AIO 対策", label, aliases: [], firstSeen: "2026-09-01" };
}

function day(takenOn: string, topicIds: string[], options: { aioPresent?: boolean; selfCited?: boolean } = {}): AioTopicDay {
  return {
    keyword: "AIO 対策",
    takenOn,
    aioPresent: options.aioPresent ?? true,
    selfCited: options.selfCited ?? false,
    topicIds,
  };
}

describe("observedDates / splitByPeriod", () => {
  const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"].map((d) => day(d, ["t1"]));

  it("重複なしの昇順", () => {
    expect(observedDates([...days, day("2026-09-02", ["t2"])])).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  it("直近 N 日を今期、その手前 N 日を前期にする", () => {
    const split = splitByPeriod(days, 2);
    expect(split.currentDays.map((d) => d.takenOn)).toEqual(["2026-09-03", "2026-09-04"]);
    expect(split.previousDays.map((d) => d.takenOn)).toEqual(["2026-09-01", "2026-09-02"]);
  });

  it("期間を指定しなければ全期間が今期", () => {
    const split = splitByPeriod(days);
    expect(split.currentDays).toHaveLength(4);
    expect(split.previousDays).toEqual([]);
  });

  it("前期に足りる日数が無ければ前期は短くなる", () => {
    const split = splitByPeriod(days, 3);
    expect(split.previousDays.map((d) => d.takenOn)).toEqual(["2026-09-01"]);
  });
});

describe("trendSeries / trendFactor", () => {
  const days = [
    day("2026-09-01", []),
    day("2026-09-02", []),
    day("2026-09-03", ["t1"]),
    day("2026-09-04", ["t1"]),
  ];

  it("AIO 表示日を区間に割って出現割合を出す", () => {
    expect(trendSeries(days, "t1", 2)).toEqual([0, 1]);
    expect(trendSeries(days, "t1", 4)).toEqual([0, 0, 1, 1]);
  });

  it("AIO 表示が無ければ空", () => {
    expect(trendSeries([day("2026-09-01", [], { aioPresent: false })], "t1")).toEqual([]);
  });

  it("傾向係数は後半 - 前半", () => {
    expect(trendFactor(days, "t1")).toBe(1);
    expect(trendFactor([...days].reverse(), "t1")).toBe(1);
    expect(trendFactor([day("2026-09-01", ["t1"])], "t1")).toBe(0);
  });
});

describe("priorityScore", () => {
  it("出現割合 x (1 + 傾向) x 未カバー係数", () => {
    expect(priorityScore(0.5, 0, "none")).toBeCloseTo(0.5);
    expect(priorityScore(0.5, 1, "none")).toBeCloseTo(1);
    expect(priorityScore(0.5, 0, "partial")).toBeCloseTo(0.25);
    expect(priorityScore(0.5, 0, "full")).toBeCloseTo(0.05);
    // 未判定は none と同じ重み（見落としを防ぐ）
    expect(priorityScore(0.5, 0, null)).toBeCloseTo(0.5);
    expect(COVERAGE_FACTOR.none).toBe(1);
  });

  it("範囲外の値は丸める", () => {
    expect(priorityScore(2, 5, "none")).toBeCloseTo(2);
    expect(priorityScore(-1, -5, "none")).toBe(0);
    expect(priorityScore(Number.NaN, Number.NaN, "none")).toBe(0);
  });
});

describe("assignPriorities（境界）", () => {
  it("5 件なら 5〜1 に分かれる", () => {
    expect(assignPriorities([0.5, 0.4, 0.3, 0.2, 0.1])).toEqual([5, 4, 3, 2, 1]);
  });

  it("10 件なら 2 件ずつ", () => {
    const scores = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];
    expect(assignPriorities(scores)).toEqual([5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
  });

  it("1 件だけなら差が付かないので中央の 3", () => {
    expect(assignPriorities([0.2])).toEqual([3]);
  });

  it("同点は同じ優先度。全件同点なら全部 5 にせず中央の 3 に寄せる", () => {
    expect(assignPriorities([0.4, 0.4, 0.4, 0.4])).toEqual([3, 3, 3, 3]);
    expect(assignPriorities([1, 1, 1, 1, 1, 1, 1, 1])).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
    // 一部だけ同点なら、その同点グループは同じ分位に入る
    expect(assignPriorities([0.9, 0.5, 0.5, 0.1])).toEqual([5, 3, 3, 1]);
  });

  it("スコア 0 は常に 1（分位の対象からも外れる）", () => {
    expect(assignPriorities([0.4, 0, 0])).toEqual([3, 1, 1]);
    expect(assignPriorities([0.9, 0.5, 0.1, 0, 0])).toEqual([5, 3, 1, 1, 1]);
    expect(assignPriorities([])).toEqual([]);
  });
});

describe("aggregateTopics", () => {
  const topics = [topic("t1", "構造化データの追加"), topic("t2", "料金の目安"), topic("t3", "導入事例")];
  const days = [
    day("2026-09-01", ["t1", "t2"], { selfCited: true }),
    day("2026-09-02", ["t1"], { aioPresent: false }),
    day("2026-09-03", ["t1", "t3"]),
    day("2026-09-04", ["t1", "t3"], { selfCited: true }),
  ];

  it("出現割合は AIO 表示日を分母にする", () => {
    const agg = aggregateTopics({ days, topics, coverage: { t1: "full", t2: "none" } });
    expect(agg.totalDays).toBe(4);
    expect(agg.aioDays).toBe(3);
    expect(agg.presenceRate).toBeCloseTo(0.75);
    expect(agg.citationRate).toBeCloseTo(2 / 3);
    expect(agg.prevCitationRate).toBeNull();

    const t1 = agg.rows.find((r) => r.topicId === "t1")!;
    expect(t1.appearances).toBe(3);
    expect(t1.share).toBe(1);
    expect(t1.coverage).toBe("full");
    // 自社が既に書いているので優先度は下がる
    const t3 = agg.rows.find((r) => r.topicId === "t3")!;
    expect(t3.priority).toBeGreaterThan(t1.priority);
  });

  it("前期を渡すと前期比が出る", () => {
    const agg = aggregateTopics({
      days: [day("2026-09-03", ["t1"]), day("2026-09-04", ["t1"])],
      previousDays: [day("2026-09-01", ["t1"]), day("2026-09-02", [])],
      topics: [topic("t1")],
    });
    const row = agg.rows[0];
    expect(row.share).toBe(1);
    expect(row.prevShare).toBeCloseTo(0.5);
    expect(row.shareDelta).toBeCloseTo(0.5);
  });

  it("観測が無くても 0 除算しない", () => {
    const agg = aggregateTopics({ days: [], topics });
    expect(agg.aioDays).toBe(0);
    expect(agg.presenceRate).toBe(0);
    expect(agg.citationRate).toBe(0);
    expect(agg.rows.every((r) => r.share === 0 && r.priority === 1)).toBe(true);
  });

  it("優先度の高い順に並ぶ", () => {
    const agg = aggregateTopics({ days, topics, coverage: { t1: "full" } });
    const priorities = agg.rows.map((r) => r.priority);
    expect([...priorities].sort((a, b) => b - a)).toEqual(priorities);
  });
});

describe("missingTopics", () => {
  const agg = aggregateTopics({
    days: [day("2026-09-01", ["t1", "t2", "t3"]), day("2026-09-02", ["t1", "t2", "t3"])],
    topics: [topic("t1", "構造化データ"), topic("t2", "料金"), topic("t3", "事例")],
    coverage: { t1: "full", t2: "partial" },
  });

  it("記載あり以外を優先度順で返す", () => {
    const rows = missingTopics(agg.rows);
    expect(rows.map((r) => r.topicId)).toEqual(["t3", "t2"]);
    expect(missingTopics(agg.rows, { includePartial: false }).map((r) => r.topicId)).toEqual(["t3"]);
  });

  it("コピー用テキストにキーワードと出現割合が入る", () => {
    const text = missingTopicsText("AIO 対策", missingTopics(agg.rows));
    expect(text).toContain("AIO 対策");
    expect(text).toContain("- 事例（出現 100% / 優先度");
    expect(text).toContain("一部のみ");
  });
});
