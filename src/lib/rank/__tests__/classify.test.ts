import { describe, expect, it } from "vitest";
import {
  aioTimeline,
  classifyAio,
  dateKey,
  formatRate,
  latestOnOrBefore,
  pickComparison,
  rankBand,
  rankDelta,
  rankSparkValues,
  snapshotOn,
  storedDates,
  summarizeAioClasses,
  type AioObservation,
} from "../classify";

describe("classifyAio（5 区分）", () => {
  it("AIO が無ければ表示なし。観測が無い・取得に失敗した場合は未取得（null）", () => {
    // 観測そのものが無いときは分類しない（未取得）
    expect(classifyAio(null)).toBeNull();
    expect(classifyAio(undefined)).toBeNull();
    // AIO は出ていたが取得に失敗した観測も未取得として扱う
    expect(classifyAio({ present: true, selfCited: true, competitorCited: false, unavailable: true })).toBeNull();
    expect(classifyAio({ present: false, selfCited: true, competitorCited: true })).toBe("none");
  });

  it("引用の組み合わせで 4 区分に分かれる", () => {
    expect(classifyAio({ present: true, selfCited: true, competitorCited: false })).toBe("self");
    expect(classifyAio({ present: true, selfCited: false, competitorCited: true })).toBe("competitor");
    expect(classifyAio({ present: true, selfCited: true, competitorCited: true })).toBe("both");
    expect(classifyAio({ present: true, selfCited: false, competitorCited: false })).toBe("neither");
  });
});

describe("summarizeAioClasses", () => {
  it("出現率と引用率を取得できた観測数で割る", () => {
    const s = summarizeAioClasses(["self", "both", "competitor", "neither", "none"]);
    expect(s.observed).toBe(5);
    expect(s.missing).toBe(0);
    expect(s.counts).toEqual({ none: 1, self: 1, competitor: 1, both: 1, neither: 1 });
    expect(s.presenceRate).toBeCloseTo(0.8);
    expect(s.citationRate).toBeCloseTo(0.4);
  });

  it("未取得（null）は分母から外す", () => {
    const s = summarizeAioClasses(["self", null, null]);
    expect(s.observed).toBe(1);
    expect(s.missing).toBe(2);
    expect(s.registered).toBe(3);
    expect(s.presenceRate).toBe(1);
  });

  it("登録数を渡しても未取得は分母に入れない（件数だけ registered / missing で返す）", () => {
    const s = summarizeAioClasses(["self", null, null], 3);
    expect(s.registered).toBe(3);
    expect(s.observed).toBe(1);
    expect(s.missing).toBe(2);
    // 登録 3 件のうち計測できた 1 件が自社引用 → 100%（3 件で割って 33% にしない）
    expect(s.presenceRate).toBe(1);
    expect(s.citationRate).toBe(1);
  });

  it("登録数の方が多いとき（計測できたのが一部だけ）も未取得件数に反映する", () => {
    const s = summarizeAioClasses(["self", "self", "both"], 30);
    expect(s.registered).toBe(30);
    expect(s.observed).toBe(3);
    expect(s.missing).toBe(27);
    expect(s.presenceRate).toBe(1);
    expect(s.citationRate).toBe(1);
  });

  it("空でも 0 除算しない", () => {
    const s = summarizeAioClasses([]);
    expect(s.presenceRate).toBe(0);
    expect(s.citationRate).toBe(0);
  });
});

describe("aioTimeline", () => {
  const observations: AioObservation[] = [
    { keywordId: "a", takenOn: "2026-09-01", aioClass: "self" },
    { keywordId: "b", takenOn: "2026-09-01", aioClass: "none" },
    { keywordId: "a", takenOn: "2026-09-02", aioClass: "both" },
    // b は 9/2 未取得
    { keywordId: "a", takenOn: "2026-09-03", aioClass: "neither" },
    { keywordId: "b", takenOn: "2026-09-03", aioClass: "competitor" },
  ];

  it("日付ごとに 5 区分を数え、未取得を除外する", () => {
    const points = aioTimeline(observations, ["a", "b"]);
    expect(points.map((p) => p.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(points[0].counts).toMatchObject({ self: 1, none: 1 });
    expect(points[0].presenceRate).toBeCloseTo(0.5);
    expect(points[1].observed).toBe(1);
    expect(points[1].missing).toBe(1);
    // 分母は取得できた 1 本。未取得の b を分母に残して 0.5 に薄めない
    expect(points[1].registered).toBe(2);
    expect(points[1].citationRate).toBe(1);
    expect(points[2].counts).toMatchObject({ neither: 1, competitor: 1 });
    expect(points[2].citationRate).toBe(0);
  });

  it("対象キーワードで絞り込める", () => {
    const points = aioTimeline(observations, ["a"]);
    expect(points).toHaveLength(3);
    expect(points[0].registered).toBe(1);
    expect(points[0].counts.self).toBe(1);
  });

  it("同じ日に取り直したら後勝ち", () => {
    const points = aioTimeline(
      [
        { keywordId: "a", takenOn: "2026-09-01", aioClass: "none" },
        { keywordId: "a", takenOn: "2026-09-01", aioClass: "self" },
      ],
      ["a"],
    );
    expect(points).toHaveLength(1);
    expect(points[0].counts.self).toBe(1);
    expect(points[0].counts.none).toBe(0);
  });
});

describe("rankBand", () => {
  it("1-5 / 6-10 / 11 位以下 / 圏外", () => {
    expect(rankBand(1)).toBe("top5");
    expect(rankBand(5)).toBe("top5");
    expect(rankBand(6)).toBe("top10");
    expect(rankBand(10)).toBe("top10");
    expect(rankBand(11)).toBe("beyond");
    expect(rankBand(100)).toBe("beyond");
    expect(rankBand(101)).toBe("out");
    expect(rankBand(null)).toBe("out");
    expect(rankBand(undefined)).toBe("out");
    expect(rankBand(0)).toBe("out");
  });
});

describe("rankDelta", () => {
  it("順位が上がれば正の差分", () => {
    expect(rankDelta(3, 8)).toEqual({ diff: 5, direction: "up" });
    expect(rankDelta(8, 3)).toEqual({ diff: -5, direction: "down" });
    expect(rankDelta(4, 4)).toEqual({ diff: 0, direction: "flat" });
  });

  it("圏外の出入りは記号だけで表す", () => {
    expect(rankDelta(9, null)).toEqual({ diff: null, direction: "in" });
    expect(rankDelta(null, 9)).toEqual({ diff: null, direction: "out" });
    expect(rankDelta(null, null)).toEqual({ diff: null, direction: "flat" });
  });

  it("観測が無い（undefined）ときは比較しない", () => {
    expect(rankDelta(3, undefined)).toEqual({ diff: null, direction: "unknown" });
    expect(rankDelta(undefined, 3)).toEqual({ diff: null, direction: "unknown" });
  });
});

describe("日付の扱い", () => {
  const rows = [
    { takenOn: "2026-09-01", rank: 12 },
    { takenOn: "2026-09-03", rank: 8 },
    { takenOn: "2026-09-05", rank: null },
  ];

  it("dateKey はローカル時刻の YYYY-MM-DD", () => {
    expect(dateKey(new Date(2026, 8, 7, 1, 30))).toBe("2026-09-07");
  });

  it("保存済みの日付を昇順で返す", () => {
    expect(storedDates([...rows, { takenOn: "2026-09-03", rank: 9 }])).toEqual([
      "2026-09-01",
      "2026-09-03",
      "2026-09-05",
    ]);
  });

  it("指定日ぴったりが無ければ undefined（未取得）", () => {
    expect(snapshotOn(rows, "2026-09-03")?.rank).toBe(8);
    expect(snapshotOn(rows, "2026-09-04")).toBeUndefined();
    expect(latestOnOrBefore(rows, "2026-09-04")?.takenOn).toBe("2026-09-03");
    expect(latestOnOrBefore(rows, "2026-08-31")).toBeUndefined();
  });

  it("既定は最新と 1 つ前、日付指定なら欠測をそのまま返す", () => {
    expect(pickComparison(rows)).toEqual({ current: rows[2], previous: rows[1] });
    const pair = pickComparison(rows, "2026-09-04", "2026-09-01");
    expect(pair.current).toBeUndefined();
    expect(pair.previous?.rank).toBe(12);
  });

  it("基準日だけ指定したときの前回は「その日より前で最も新しい観測」", () => {
    // sorted[1]（全履歴の 2 番目に新しい観測）を返すと基準日より後の日が
    // 「前回」になり、変化が逆向きに出てしまう
    const pair = pickComparison(rows, "2026-09-03");
    expect(pair.current?.rank).toBe(8);
    expect(pair.previous?.takenOn).toBe("2026-09-01");
  });

  it("基準日より前の観測が無ければ前回は undefined", () => {
    expect(pickComparison(rows, "2026-09-01").previous).toBeUndefined();
  });

  it("1 件しか無ければ前回は undefined", () => {
    expect(pickComparison([rows[0]]).previous).toBeUndefined();
  });
});

describe("rankSparkValues", () => {
  it("上向き = 改善になるよう反転し、圏外は最低値にする", () => {
    expect(rankSparkValues(rows())).toEqual([89, 93, 0]);
  });

  function rows() {
    return [
      { takenOn: "2026-09-03", rank: 8 },
      { takenOn: "2026-09-05", rank: null },
      { takenOn: "2026-09-01", rank: 12 },
    ];
  }
});

describe("formatRate", () => {
  it("整数はそのまま、端数は小数 1 桁", () => {
    expect(formatRate(0.5)).toBe("50%");
    expect(formatRate(0.1234)).toBe("12.3%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(Number.NaN)).toBe("—");
  });
});
