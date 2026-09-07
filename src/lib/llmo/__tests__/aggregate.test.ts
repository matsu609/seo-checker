/**
 * 集計（率・時系列の欠損・ランキング・比較表・未分類）。
 */
import { describe, expect, it } from "vitest";
import {
  comparisonMatrix,
  datesOf,
  kpi,
  latestDate,
  promptRows,
  ranking,
  rate,
  seriesByEntity,
  seriesByProvider,
  unclassifiedTop,
} from "../aggregate";
import type { LlmoEntity, LlmoRun, ProviderId } from "../types";

const entities: LlmoEntity[] = [
  { id: "self", name: "自社", domains: ["example.co.jp"], brandAliases: ["自社"], isSelf: true },
  { id: "rival", name: "競合A", domains: ["rival.example.com"], brandAliases: ["競合A"] },
];

let seq = 0;

function run(
  takenOn: string,
  providerId: ProviderId,
  options: {
    promptId?: string;
    self?: [boolean, boolean];
    rival?: [boolean, boolean];
    status?: "ok" | "error";
    unclassified?: Array<[string, number]>;
  } = {},
): LlmoRun {
  seq += 1;
  const [sb, sd] = options.self ?? [false, false];
  const [rb, rd] = options.rival ?? [false, false];
  return {
    id: `run-${seq}`,
    projectId: "p1",
    takenOn,
    measuredAt: `${takenOn}T09:00:00.000Z`,
    promptId: options.promptId ?? "prompt-1",
    promptText: options.promptId === "prompt-2" ? "二つ目" : "一つ目",
    providerId,
    model: `${providerId}-model`,
    status: options.status ?? "ok",
    answer: "回答",
    citations: [],
    searchQueries: [],
    fanoutSupported: providerId !== "perplexity",
    judgements: [
      { entityId: "self", brandMentioned: sb, domainCited: sd, matchedDomains: [], matchedAliases: [] },
      { entityId: "rival", brandMentioned: rb, domainCited: rd, matchedDomains: [], matchedAliases: [] },
    ],
    unclassified: (options.unclassified ?? []).map(([domain, count]) => ({
      domain,
      count,
      sampleUrl: `https://${domain}/x`,
      sampleTitle: null,
    })),
  };
}

const runs: LlmoRun[] = [
  run("2026-09-01", "claude", { self: [true, true], rival: [true, false], unclassified: [["note.example.net", 2]] }),
  run("2026-09-01", "openai", { self: [false, true], rival: [true, true] }),
  // 9/2 は取得失敗のみ（欠損日）
  run("2026-09-02", "claude", { status: "error" }),
  run("2026-09-03", "claude", { self: [true, false], rival: [false, false], unclassified: [["note.example.net", 1]] }),
  run("2026-09-03", "openai", { self: [true, true], rival: [false, false], promptId: "prompt-2" }),
];

describe("rate", () => {
  it("成功した回答だけを分母にする", () => {
    expect(rate(runs, "self", "brand")).toBeCloseTo(3 / 4);
    expect(rate(runs, "self", "domain")).toBeCloseTo(3 / 4);
    expect(rate(runs, "rival", "brand")).toBeCloseTo(2 / 4);
  });

  it("成功した回答が無ければ null（0% と区別する）", () => {
    expect(rate([run("2026-09-02", "claude", { status: "error" })], "self", "brand")).toBeNull();
    expect(rate([], "self", "brand")).toBeNull();
  });
});

describe("datesOf / latestDate", () => {
  it("失敗しかない日は最新日に選ばない", () => {
    expect(datesOf(runs)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(latestDate(runs)).toBe("2026-09-03");
  });
});

describe("kpi", () => {
  it("自社の言及率・引用率と失敗件数を返す", () => {
    const all = kpi(runs, "self");
    expect(all.calls).toBe(4);
    expect(all.failed).toBe(1);
    expect(all.days).toBe(2);
    expect(all.brandRate).toBeCloseTo(3 / 4);

    const latest = kpi(runs, "self", "2026-09-03");
    expect(latest.calls).toBe(2);
    expect(latest.brandRate).toBe(1);
    expect(latest.domainRate).toBeCloseTo(0.5);
  });

  it("自社が未登録なら率は null", () => {
    expect(kpi(runs, null).brandRate).toBeNull();
  });
});

describe("時系列", () => {
  const colors = ["#111111", "#222222"];

  it("会社別: 取得できなかった日は null（欠損）にする", () => {
    const chart = seriesByEntity(runs, entities, "brand", colors);
    expect(chart.dates).toEqual(["2026-09-01", "2026-09-03"]);
    expect(chart.series[0]).toMatchObject({ key: "self", label: "自社", isSelf: true, color: "#111111" });
    expect(chart.series[0].values).toEqual([0.5, 1]);
    expect(chart.series[1].values).toEqual([1, 0]);
  });

  it("欠損日が両端に無い場合も日付の並びに穴を作らない", () => {
    const withGap = [...runs, run("2026-09-05", "claude", { self: [true, true] })];
    const chart = seriesByEntity(withGap, entities, "domain", colors);
    expect(chart.dates).toEqual(["2026-09-01", "2026-09-03", "2026-09-05"]);
    expect(chart.series[0].values).toEqual([1, 0.5, 1]);
  });

  it("モデル別: そのモデルの結果が無い日は null", () => {
    const chart = seriesByProvider(runs, "self", "brand", colors);
    expect(chart.series.map((s) => s.key)).toEqual(["claude", "openai"]);
    expect(chart.series[0].values).toEqual([1, 1]);
    expect(chart.series[1].values).toEqual([0, 1]);
  });

  it("自社が未登録ならモデル別は描けない", () => {
    expect(seriesByProvider(runs, null, "brand", colors).series).toEqual([]);
  });
});

describe("ranking / comparisonMatrix", () => {
  it("最新日の会社別ランキングを言及率の降順で返す", () => {
    const rows = ranking(runs, entities);
    expect(rows[0].entityId).toBe("self");
    expect(rows[0].isSelf).toBe(true);
    expect(rows[0].brandRate).toBe(1);
    expect(rows[1].brandRate).toBe(0);
  });

  it("比較表は最新日のモデル別に ○ を立てる", () => {
    const matrix = comparisonMatrix(runs, entities, "2026-09-01");
    expect(matrix.providers).toEqual(["claude", "openai"]);
    const self = matrix.rows.find((r) => r.entityId === "self");
    expect(self?.cells[0]).toMatchObject({ providerId: "claude", brand: true, domain: true });
    expect(self?.cells[1]).toMatchObject({ providerId: "openai", brand: false, domain: true });
  });
});

describe("unclassifiedTop / promptRows", () => {
  it("未分類ドメインを日付横断で合算する", () => {
    expect(unclassifiedTop(runs)).toEqual([
      { domain: "note.example.net", count: 3, sampleUrl: "https://note.example.net/x", sampleTitle: null },
    ]);
  });

  it("プロンプト別に成功数と失敗数を分ける", () => {
    const rows = promptRows(runs, "self");
    const first = rows.find((r) => r.promptId === "prompt-1");
    expect(first).toMatchObject({ calls: 3, failed: 1 });
    expect(first?.brandRate).toBeCloseTo(2 / 3);
    expect(rows.find((r) => r.promptId === "prompt-2")).toMatchObject({ calls: 1, failed: 0 });
  });
});
