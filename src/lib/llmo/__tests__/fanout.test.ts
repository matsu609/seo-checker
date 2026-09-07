/**
 * ファンアウト（最新情報フラグ・一覧・頻度・取得可否）。
 */
import { describe, expect, it } from "vitest";
import { fanoutFrequency, fanoutRows, fanoutSupport, isFreshQuery, normalizeQuery } from "../fanout";
import type { LlmoRun, ProviderId } from "../types";

let seq = 0;

function run(providerId: ProviderId, promptId: string, queries: string[], status: "ok" | "error" = "ok"): LlmoRun {
  seq += 1;
  return {
    id: `run-${seq}`,
    projectId: "p1",
    takenOn: "2026-09-03",
    measuredAt: "2026-09-03T09:00:00.000Z",
    promptId,
    promptText: `プロンプト ${promptId}`,
    providerId,
    model: `${providerId}-model`,
    status,
    answer: "",
    citations: [],
    searchQueries: queries,
    fanoutSupported: providerId !== "perplexity",
    judgements: [],
    unclassified: [],
  };
}

describe("isFreshQuery", () => {
  it("最新・今年・現在・YYYY年 を含むクエリに印を付ける", () => {
    expect(isFreshQuery("SEO ツール 最新")).toBe(true);
    expect(isFreshQuery("今年のトレンド")).toBe(true);
    expect(isFreshQuery("現在の料金")).toBe(true);
    expect(isFreshQuery("2026年 SEO")).toBe(true);
    expect(isFreshQuery("２０２６年 SEO")).toBe(true);
    expect(isFreshQuery("2026 年 SEO")).toBe(true);
  });

  it("それ以外は false", () => {
    expect(isFreshQuery("SEO ツール 比較")).toBe(false);
    expect(isFreshQuery("2026 SEO")).toBe(false);
    expect(isFreshQuery("")).toBe(false);
  });
});

describe("fanoutRows", () => {
  const runs = [
    run("claude", "p1", ["SEO ツール 比較", " ", "SEO ツール 最新"]),
    run("openai", "p1", ["SEO ツール 比較"]),
    run("claude", "p2", ["AIO 対策 とは"]),
    run("gemini", "p3", ["失敗した"], "error"),
    run("perplexity", "p1", []),
  ];

  it("失敗した回答と空クエリを除いて一覧にする", () => {
    const rows = fanoutRows(runs);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.query.trim().length > 0)).toBe(true);
    expect(rows.some((r) => r.query === "失敗した")).toBe(false);
  });

  it("最新情報フラグを行に持たせる", () => {
    const fresh = fanoutRows(runs).find((r) => r.query === "SEO ツール 最新");
    expect(fresh?.fresh).toBe(true);
  });

  it("頻度はプロンプト数 → 出現回数の順で並べる", () => {
    const freq = fanoutFrequency(fanoutRows(runs));
    expect(freq[0]).toMatchObject({ query: "SEO ツール 比較", count: 2, promptCount: 1 });
    expect(freq[0].providers).toEqual(["claude", "openai"]);
    expect(freq.map((f) => f.query)).toContain("AIO 対策 とは");
  });

  it("表記ゆれ（全角・大小・空白）は同じクエリにまとめる", () => {
    expect(normalizeQuery("ＳＥＯ  ツール")).toBe("seo ツール");
    const freq = fanoutFrequency(fanoutRows([run("claude", "p1", ["SEO ツール"]), run("openai", "p2", ["ＳＥＯ ツール"])]));
    expect(freq).toHaveLength(1);
    expect(freq[0]).toMatchObject({ count: 2, promptCount: 2 });
  });
});

describe("fanoutSupport", () => {
  it("Perplexity は対象外として返す", () => {
    const support = fanoutSupport([run("claude", "p1", ["a", "b"]), run("perplexity", "p1", [])]);
    expect(support.find((s) => s.providerId === "claude")).toMatchObject({ supported: true, queries: 2, answers: 1 });
    expect(support.find((s) => s.providerId === "perplexity")).toMatchObject({ supported: false, queries: 0 });
    // 実行していないモデルも 0 件で並ぶ（表が欠けないように）
    expect(support).toHaveLength(4);
  });
});
