/** GSC × GA4 の突き合わせ（docs/dev/diagnosis-rules-spec.md §11） */
import { describe, expect, it } from "vitest";
import { runDiagnosis, type RunDiagnosisInput } from "../engine";
import { CROSS_RULES, CROSS_SKIPPED } from "../rules";
import { dataset, event, ga4Dataset, metrics, ORIGIN, row, sessions } from "./fixtures";

function run(over: Partial<RunDiagnosisInput> = {}) {
  return runDiagnosis({
    origin: ORIGIN,
    goal: "inquiry",
    brandTerms: ["サンプル商事"],
    gsc: dataset(),
    ga4: ga4Dataset(),
    ...over,
  });
}

const idsOf = (r: ReturnType<typeof run>) => r.triggered.map((t) => t.id);

describe("作るルールを絞った判断（2026-09-16）", () => {
  it("実装したのは 8 件だけ", () => {
    expect(CROSS_RULES.map((r) => r.id).sort()).toEqual(["X02", "X03", "X14", "X15", "X16", "X17", "X18", "X20"]);
  });

  it("作らなかったものは理由つきで残してある", () => {
    const skipped = CROSS_SKIPPED.flatMap((s) => s.ids);
    expect(skipped).toContain("X09");
    expect(skipped).toContain("X01");
    for (const group of CROSS_SKIPPED) expect(group.reason.length).toBeGreaterThan(10);
  });

  it("既存のルールと ID が重複していない", () => {
    expect(new Set(CROSS_RULES.map((r) => r.id)).size).toBe(CROSS_RULES.length);
  });
});

describe("X02 検索のクリックに対して訪問が少なすぎる", () => {
  it("GA4 の自然検索セッションがクリックの 6 割未満だと発火する", () => {
    const result = run({
      gsc: dataset({ totals: { current: metrics(1000, 20000), previous: metrics(1000, 20000) } }),
      ga4: ga4Dataset({ channels: { current: [sessions("Organic Search", 300), sessions("Direct", 700)] } }),
    });
    const x02 = result.triggered.find((t) => t.id === "X02");
    expect(x02).toBeDefined();
    expect(x02!.severity).toBe("critical");
    expect(x02!.evidence.join()).toContain("700");
    // Direct が高いので、その手がかりも添える
    expect(x02!.evidence.join()).toContain("Direct");
  });

  it("2 割程度の差では発火しない（完全一致は求めない）", () => {
    const result = run({
      gsc: dataset({ totals: { current: metrics(700, 20000), previous: metrics(700, 20000) } }),
      ga4: ga4Dataset({ channels: { current: [sessions("Organic Search", 600), sessions("Direct", 400)] } }),
    });
    expect(idsOf(result)).not.toContain("X02");
  });

  it("完全一致を求めてはいけない、と明記されている", () => {
    const rule = CROSS_RULES.find((r) => r.id === "X02")!;
    expect(rule.prohibitedConclusions.join()).toContain("完全一致を求めない");
  });

  it("片方しか無ければ発火しない", () => {
    expect(idsOf(run({ ga4: null }))).not.toContain("X02");
    expect(idsOf(run({ gsc: null }))).not.toContain("X02");
  });
});

describe("X03 逆にサイト側の訪問のほうが多い", () => {
  it("GA4 がクリックの 1.5 倍を超えると発火する", () => {
    const result = run({
      gsc: dataset({ totals: { current: metrics(300, 20000), previous: metrics(300, 20000) } }),
      ga4: ga4Dataset({ channels: { current: [sessions("Organic Search", 800), sessions("Direct", 200)] } }),
    });
    expect(idsOf(result)).toContain("X03");
  });
});

describe("X15 / X16 モバイルの問題がどちら側にあるか", () => {
  const scDevices = (mobileCtr: number) => ({
    current: [row("MOBILE", Math.round(3000 * mobileCtr), 3000, 12), row("DESKTOP", 260, 2600, 8)],
  });

  it("X15 検索結果側が悪く、ページ側は良い", () => {
    const result = run({
      gsc: dataset({ devices: scDevices(0.02) }),
      ga4: ga4Dataset({ devices: { current: [sessions("mobile", 300, { engagedSessions: 240 }), sessions("desktop", 300, { engagedSessions: 200 })] } }),
    });
    const x15 = result.triggered.find((t) => t.id === "X15");
    expect(x15).toBeDefined();
    expect(x15!.recommendedActions.join()).toContain("ページの作り直しではなく");
    expect(idsOf(result)).not.toContain("X16");
  });

  it("X16 検索結果側は普通で、ページ側が悪い", () => {
    const result = run({
      gsc: dataset({ devices: scDevices(0.095) }),
      ga4: ga4Dataset({ devices: { current: [sessions("mobile", 300, { engagedSessions: 90 }), sessions("desktop", 300, { engagedSessions: 240 })] } }),
    });
    const x16 = result.triggered.find((t) => t.id === "X16");
    expect(x16).toBeDefined();
    expect(x16!.recommendedActions.join()).toContain("ページ側を先に直す");
    expect(idsOf(result)).not.toContain("X15");
  });

  it("両方は同時に発火しない", () => {
    for (const ctr of [0.02, 0.095]) {
      const result = run({ gsc: dataset({ devices: scDevices(ctr) }) });
      const both = idsOf(result).filter((id) => id === "X15" || id === "X16");
      expect(both.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("X17 順位は上がったのに訪問が増えていない", () => {
  it("ページ単位で突き合わせて発火する", () => {
    const result = run({
      gsc: dataset({
        pages: {
          current: [row(`${ORIGIN}/service/sign`, 80, 5100, 6)],
          previous: [row(`${ORIGIN}/service/sign`, 80, 5100, 14)],
        },
      }),
      ga4: ga4Dataset({
        landing: { current: [sessions("/service/sign", 100)], previous: [sessions("/service/sign", 100)] },
      }),
    });
    const x17 = result.triggered.find((t) => t.id === "X17");
    expect(x17).toBeDefined();
    expect(x17!.evidence.join()).toContain("/service/sign");
  });

  it("訪問も増えていれば発火しない", () => {
    const result = run({
      gsc: dataset({
        pages: {
          current: [row(`${ORIGIN}/service/sign`, 80, 5100, 6)],
          previous: [row(`${ORIGIN}/service/sign`, 80, 5100, 14)],
        },
      }),
      ga4: ga4Dataset({
        landing: { current: [sessions("/service/sign", 200)], previous: [sessions("/service/sign", 100)] },
      }),
    });
    expect(idsOf(result)).not.toContain("X17");
  });
});

describe("X14 海外の表示は多いが行動が伴わない", () => {
  it("GSC の海外表示と GA4 の海外セッションを突き合わせる", () => {
    const result = run({
      gsc: dataset({ countries: { current: [row("jpn", 280, 4000, 10), row("usa", 5, 1600, 40)] } }),
      ga4: ga4Dataset({ countries: [sessions("Japan", 900, { engagedSessions: 600 }), sessions("United States", 100, { engagedSessions: 20 })] }),
    });
    const x14 = result.triggered.find((t) => t.id === "X14");
    expect(x14).toBeDefined();
    expect(x14!.prohibitedConclusions.join()).toContain("海外に需要があると断定しない");
  });
});

describe("X20 流入は減ったが問い合わせ率は上がっている", () => {
  it("クリック減 × Organic CVR で発火する", () => {
    const result = run({
      gsc: dataset({ totals: { current: metrics(200, 5600), previous: metrics(400, 5600) } }),
      ga4: ga4Dataset({
        channels: { current: [sessions("Organic Search", 300)], previous: [sessions("Organic Search", 600)] },
        channelEvents: [{ channel: "Organic Search", event: "generate_lead", sessions: 10 }],
        events: [event("contact_click", { sessions: 50 }), event("form_start", { sessions: 30 }), event("generate_lead", { sessions: 10, keyEvents: 10 })],
      }),
    });
    expect(idsOf(result)).toContain("X20");
  });
});
