import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnalysisSchema, LIMITS, tidyAnalysis, tidyComment, type Analysis } from "../ai/schema";

describe("AI 出力の形", () => {
  it("上限を超えた出力でもスキーマの検証は通り、切り詰めで収まる", () => {
    const long = "あ".repeat(2000);
    const raw: Analysis = {
      headline: long,
      situation: Array.from({ length: 10 }, () => long),
      strengths: Array.from({ length: 9 }, () => ({ text: long, factIds: Array.from({ length: 20 }, (_, i) => `S-${i}`) })),
      weaknesses: [],
      recommendations: Array.from({ length: 20 }, () => ({
        priority: 9,
        title: long,
        what: long,
        why: long,
        expected: long,
        effort: "low" as const,
        factIds: ["S-01"],
        before: null,
        after: long,
      })),
      consultant: { typical: Array.from({ length: 8 }, () => long), real: [] },
      cautions: [],
    };
    // SDK は API 側で長さを縛らないので、この形でも parse は通らなければならない
    expect(AnalysisSchema.safeParse(raw).success).toBe(true);
    const t = tidyAnalysis(raw);
    expect(t.headline.length).toBeLessThanOrEqual(LIMITS.headline);
    expect(t.situation).toHaveLength(LIMITS.situation);
    expect(t.strengths).toHaveLength(LIMITS.strengths);
    expect(t.strengths[0].factIds).toHaveLength(LIMITS.factIds);
    expect(t.recommendations).toHaveLength(LIMITS.recommendations);
    expect(t.recommendations[0].priority).toBe(3);
    expect(t.recommendations[0].what.length).toBeLessThanOrEqual(LIMITS.long);
    expect(t.consultant.typical).toHaveLength(LIMITS.consultant);
  });

  it("priority は 1〜3 に丸める", () => {
    const base: Analysis = { headline: "x", situation: ["a", "b"], strengths: [], weaknesses: [], recommendations: [{ priority: 0, title: "t", what: "w", why: "y", expected: "e", effort: "medium", factIds: [], before: null, after: null }], consultant: { typical: [], real: [] }, cautions: [] };
    expect(tidyAnalysis(base).recommendations[0].priority).toBe(1);
  });

  it("SDK の出力形式に変換できる", () => {
    expect(zodOutputFormat(AnalysisSchema)).toBeTruthy();
  });

  it("コメントも同様に切り詰める", () => {
    const c = tidyComment({ summary: "s", points: Array.from({ length: 10 }, () => ({ text: "p", factIds: [] })), actions: [], cautions: ["a", "b", "c", "d"] });
    expect(c.points).toHaveLength(LIMITS.points);
    expect(c.cautions).toHaveLength(3);
  });
});
