import { afterEach, describe, expect, it } from "vitest";
import { AnalysisInputSchema, normalizeInput } from "../input";
import { monthlyLimit, monthStartJst } from "../runs";

describe("回数制限と入力", () => {
  const original = process.env.SEO_ANALYSIS_MONTHLY_LIMIT;
  afterEach(() => {
    if (original === undefined) delete process.env.SEO_ANALYSIS_MONTHLY_LIMIT;
    else process.env.SEO_ANALYSIS_MONTHLY_LIMIT = original;
  });

  it("月初は JST で決める", () => {
    // JST 9/1 0:30 = UTC 8/31 15:30 → 9 月扱い
    expect(monthStartJst(new Date("2026-08-31T15:30:00Z"))).toBe("2026-08-31T15:00:00.000Z");
    // JST 8/31 23:30 = UTC 8/31 14:30 → 8 月扱い
    expect(monthStartJst(new Date("2026-08-31T14:30:00Z"))).toBe("2026-07-31T15:00:00.000Z");
  });

  it("上限は環境変数で変えられる（既定 10）", () => {
    delete process.env.SEO_ANALYSIS_MONTHLY_LIMIT;
    expect(monthlyLimit()).toBe(10);
    process.env.SEO_ANALYSIS_MONTHLY_LIMIT = "3";
    expect(monthlyLimit()).toBe(3);
    process.env.SEO_ANALYSIS_MONTHLY_LIMIT = "abc";
    expect(monthlyLimit()).toBe(10);
  });

  it("入力は URL だけで通り、配列は重複を除いて上限で切る", () => {
    const parsed = AnalysisInputSchema.parse({ url: " https://example.test/ ", keywords: ["a", "a", "b", "c", "d"], competitors: ["x", "x"] });
    const input = normalizeInput(parsed);
    expect(input.url).toBe("https://example.test/");
    expect(input.keywords).toEqual(["a", "b", "c", "d"]);
    expect(input.competitors).toEqual(["x"]);
    expect(input.goal).toBe("other");
    // クロールの上限は入力に関係なく 200 固定（利用者の決定 2026-09-18）
    expect(input.maxPages).toBe(200);
    expect(AnalysisInputSchema.safeParse({ url: "" }).success).toBe(false);
    expect(AnalysisInputSchema.safeParse({ url: "x", keywords: ["1", "2", "3", "4", "5", "6"] }).success).toBe(false);
  });
});
