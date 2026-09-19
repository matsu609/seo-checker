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
      consultant: { real: Array.from({ length: 8 }, () => long) },
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
    expect(t.consultant.real).toHaveLength(LIMITS.consultant);
  });

  it("priority は 1〜3 に丸める", () => {
    const base: Analysis = { headline: "x", situation: ["a", "b"], strengths: [], weaknesses: [], recommendations: [{ priority: 0, title: "t", what: "w", why: "y", expected: "e", effort: "medium", factIds: [], before: null, after: null }], consultant: { real: [] }, cautions: [] };
    expect(tidyAnalysis(base).recommendations[0].priority).toBe(1);
  });

  it("保存しうる最大の文字数を小さく保つ（出力を増やし過ぎない歯止め。2026-09-19）", () => {
    const rec = 80 + LIMITS.long + LIMITS.short * 4;
    const ceiling =
      LIMITS.headline +
      LIMITS.situation * LIMITS.paragraph +
      LIMITS.strengths * LIMITS.short +
      LIMITS.weaknesses * LIMITS.short +
      LIMITS.recommendations * rec +
      LIMITS.consultant * LIMITS.long +
      LIMITS.cautions * LIMITS.short;
    // 2026-09-19 以前は 57,600 文字。利用者の指示で約 3 分の 1 に絞った
    expect(ceiling).toBeLessThanOrEqual(20_000);
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
