/** 診断テスト（docs/dev/diagnosis-rules-spec.md §23） */
import { describe, expect, it } from "vitest";
import { priorityScore, runDiagnosis, RULES_VERSION } from "../engine";
import { ALL_RULES } from "../rules";
import { dataset, days, metrics, ORIGIN, row } from "./fixtures";
import type { RunDiagnosisInput } from "../engine";

function run(over: Partial<RunDiagnosisInput> = {}) {
  return runDiagnosis({
    origin: ORIGIN,
    goal: "inquiry",
    brandTerms: ["サンプル商事"],
    gsc: dataset(),
    ga4: null,
    ...over,
  });
}

const idsOf = (r: ReturnType<typeof run>) => r.triggered.map((t) => t.id);

describe("ルール一式", () => {
  it("ID が重複していない", () => {
    const ids = ALL_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("すべてのルールが原因候補・確認事項・打ち手を持っている", () => {
    for (const rule of ALL_RULES) {
      expect(rule.possibleCauses.length, rule.id).toBeGreaterThan(0);
      expect(rule.requiredChecks.length, rule.id).toBeGreaterThan(0);
      expect(rule.recommendedActions.length, rule.id).toBeGreaterThan(0);
    }
  });

  it("実行記録にルールの版が入る", () => {
    expect(run().rulesVersion).toBe(RULES_VERSION);
  });
});

describe("T02: 表示増・クリック横ばい", () => {
  it("表示が 35% 増え、クリックが 2% しか増えていないと発火する", () => {
    const result = run({
      gsc: dataset({
        totals: { current: metrics(286, 7560, 12.5), previous: metrics(280, 5600, 12.5) },
      }),
    });
    expect(idsOf(result)).toContain("T02");
    const t02 = result.triggered.find((t) => t.id === "T02")!;
    expect(t02.evidence.join()).toContain("+35.0%");
    expect(t02.severity).toBe("high");
  });

  it("クリックも同じだけ増えていれば T02 ではなく T01", () => {
    const result = run({
      gsc: dataset({
        totals: { current: metrics(378, 7560), previous: metrics(280, 5600) },
      }),
    });
    expect(idsOf(result)).toContain("T01");
    expect(idsOf(result)).not.toContain("T02");
  });

  it("T01〜T07 は同時に 2 つ以上発火しない", () => {
    const result = run({
      gsc: dataset({ totals: { current: metrics(200, 7560), previous: metrics(280, 5600) } }),
    });
    const combos = idsOf(result).filter((id) => ["T01", "T02", "T03", "T04", "T05", "T06", "T07"].includes(id));
    expect(combos).toHaveLength(1);
  });
});

describe("Q01: 指名検索依存", () => {
  it("指名のクリック比率が高いと発火する", () => {
    const result = run({
      gsc: dataset({
        queries: {
          current: [row("サンプル商事", 200, 400, 1.2), row("サンプル商事 評判", 20, 60, 2), row("看板 製作", 60, 5140, 14)],
        },
      }),
    });
    expect(idsOf(result)).toContain("Q01");
    expect(result.triggered.find((t) => t.id === "Q01")!.evidence.join()).toContain("一覧に出ているクエリの中での比率");
  });

  it("クエリ取得率が低いときは確度を下げる（D04 も同時に発火）", () => {
    const result = run({
      gsc: dataset({
        // 全体 1,000 クリックに対し、一覧は 280 クリックしか出ていない
        totals: { current: metrics(1000, 5600), previous: metrics(1000, 5600) },
        queries: { current: [row("サンプル商事", 240, 400, 1.2), row("看板 製作", 40, 5200, 14)] },
      }),
    });
    expect(idsOf(result)).toContain("D04");
    expect(idsOf(result)).toContain("Q01");
    expect(result.triggered.find((t) => t.id === "Q01")!.confidence).toBe("low");
  });

  it("ブランド語が未設定なら発火しない", () => {
    expect(idsOf(run({ brandTerms: [] }))).not.toContain("Q01");
  });
});

describe("D 系: データ品質", () => {
  it("D01 期間が 28 日に満たないと発火する", () => {
    const result = run({
      gsc: dataset({
        range: { current: { startDate: "2026-08-15", endDate: "2026-08-28" }, previous: { startDate: "2026-08-01", endDate: "2026-08-14" } },
      }),
    });
    expect(idsOf(result)).toContain("D01");
  });

  it("D02 当期と前期の日数が違うと発火する", () => {
    const result = run({
      gsc: dataset({
        range: { current: { startDate: "2026-08-01", endDate: "2026-08-31" }, previous: { startDate: "2026-07-04", endDate: "2026-07-31" } },
      }),
    });
    expect(idsOf(result)).toContain("D02");
  });

  it("D05 連携が無いと発火し、GSC のルールは一切発火しない", () => {
    const result = run({ gsc: null });
    expect(idsOf(result)).toEqual(["D05"]);
    expect(result.limitations.join()).toContain("Search Console と連携していない");
  });

  it("D06 連携先が分析対象と違うと発火する", () => {
    const result = run({ gsc: dataset({ siteUrl: "https://other.example.jp/" }) });
    expect(idsOf(result)).toContain("D06");
  });

  it("D08 日別の値が中央値の 3 倍を超えると発火する", () => {
    const spike = days();
    spike[10] = row(spike[10].key, 10, 900);
    expect(idsOf(run({ gsc: dataset({ byDate: spike }) }))).toContain("D08");
  });

  it("素直なデータでは D01・D02・D03・D04 は発火しない", () => {
    const ids = idsOf(run());
    for (const id of ["D01", "D02", "D03", "D04"]) expect(ids).not.toContain(id);
  });
});

describe("断定を避ける（§18）", () => {
  it("モバイル CTR が低くても、ページの表示崩れとは書かせない", () => {
    const result = run({
      gsc: dataset({
        devices: { current: [row("MOBILE", 30, 3000, 12), row("DESKTOP", 250, 2600, 8)] },
      }),
    });
    const v01 = result.triggered.find((t) => t.id === "V01");
    expect(v01).toBeDefined();
    expect(v01!.prohibitedConclusions.join()).toContain("レスポンシブ表示");
    expect(v01!.possibleCauses.length).toBeGreaterThan(1);
  });

  it("URL の形が複数あっても、重複コンテンツとは書かせない", () => {
    const result = run({
      gsc: dataset({
        pages: { current: [row(`${ORIGIN}/a.html`, 10, 300), row(`${ORIGIN}/b`, 10, 300)] },
      }),
    });
    const u01 = result.triggered.find((t) => t.id === "U01");
    expect(u01).toBeDefined();
    expect(u01!.prohibitedConclusions.join()).toContain("別ページ");
  });

  it("海外の表示が多くても、海外需要があるとは書かせない", () => {
    const result = run({
      gsc: dataset({
        countries: { current: [row("jpn", 280, 4000, 10), row("usa", 0, 1600, 40)] },
      }),
    });
    const g02 = result.triggered.find((t) => t.id === "G02");
    expect(g02).toBeDefined();
    expect(g02!.prohibitedConclusions.join()).toContain("海外に需要があると断定しない");
  });

  it("検索での見え方が空でも、構造化データのエラーとは書かせない", () => {
    const s01 = run().triggered.find((t) => t.id === "S01");
    expect(s01).toBeDefined();
    expect(s01!.prohibitedConclusions.join()).toContain("エラーと断定しない");
  });

  it("GA4 が無いときは訪問後のことを判定しない", () => {
    expect(run().limitations.join()).toContain("訪問後の行動");
  });

  it("CRM が無いときは受注貢献を判定しない", () => {
    expect(run().limitations.join()).toContain("商談化・受注への貢献は判定していません");
  });
});

describe("優先度スコア（§15）", () => {
  it("重要度 × 影響量 × 確度 ÷ 実装負担", () => {
    expect(priorityScore({ severity: "high", confidence: "medium", impact: 1, effort: "small" })).toBeCloseTo(3 * 1 * 0.7);
    expect(priorityScore({ severity: "low", confidence: "low", impact: 0.5, effort: "large" })).toBeCloseTo((1 * 0.5 * 0.4) / 3);
  });

  it("発火したルールは優先度の高い順に並ぶ", () => {
    const result = run({
      gsc: dataset({
        totals: { current: metrics(286, 7560), previous: metrics(280, 5600) },
        queries: { current: [row("サンプル商事", 240, 400, 1.2), row("看板 製作", 46, 7160, 14)] },
      }),
    });
    const scores = result.triggered.map((t) => t.priority);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("ルールの不具合で診断全体を止めない", () => {
  it("evaluate が例外を投げても他のルールは動く", () => {
    const broken = {
      ...ALL_RULES[0],
      id: "ZZ99",
      evaluate: () => {
        throw new Error("boom");
      },
    };
    const result = runDiagnosis({
      origin: ORIGIN,
      goal: "inquiry",
      brandTerms: [],
      gsc: null,
      ga4: null,
      rules: [broken, ...ALL_RULES],
    });
    expect(idsOf(result)).toContain("D05");
    expect(idsOf(result)).not.toContain("ZZ99");
  });
});
