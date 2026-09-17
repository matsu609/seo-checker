/**
 * CTR カーブとファインダビリティスコア（§18.2）。手計算した値と突き合わせる。
 */
import { describe, expect, it } from "vitest";
import { CTR_CURVE, ctrForRank, findabilityScore, formatFindability } from "../findability";

describe("CTR_CURVE / ctrForRank", () => {
  it("仕様どおりの CTR カーブを持つ", () => {
    expect(CTR_CURVE.map((b) => b.ctr)).toEqual([
      0.28, 0.15, 0.11, 0.08, 0.07, 0.05, 0.04, 0.035, 0.03, 0.025, 0.01, 0.003, 0,
    ]);
  });

  it("1〜10 位はそれぞれの値", () => {
    expect(ctrForRank(1)).toBe(0.28);
    expect(ctrForRank(2)).toBe(0.15);
    expect(ctrForRank(3)).toBe(0.11);
    expect(ctrForRank(4)).toBe(0.08);
    expect(ctrForRank(5)).toBe(0.07);
    expect(ctrForRank(6)).toBe(0.05);
    expect(ctrForRank(7)).toBe(0.04);
    expect(ctrForRank(8)).toBe(0.035);
    expect(ctrForRank(9)).toBe(0.03);
    expect(ctrForRank(10)).toBe(0.025);
  });

  it("11〜20 位は 1%、21 位以下は 0.3%、100 位までが圏内", () => {
    expect(ctrForRank(11)).toBe(0.01);
    expect(ctrForRank(20)).toBe(0.01);
    expect(ctrForRank(21)).toBe(0.003);
    expect(ctrForRank(100)).toBe(0.003);
  });

  it("圏外・未取得・範囲外は 0", () => {
    expect(ctrForRank(null)).toBe(0);
    expect(ctrForRank(undefined)).toBe(0);
    expect(ctrForRank(101)).toBe(0);
    expect(ctrForRank(0)).toBe(0);
    expect(ctrForRank(Number.NaN)).toBe(0);
  });
});

describe("findabilityScore", () => {
  it("手計算した値と一致する", () => {
    // 280 + 55 + 2 + 0 = 337、分母 2000 → 16.85
    const result = findabilityScore([
      { rank: 1, volume: 1000 },
      { rank: 3, volume: 500 },
      { rank: 15, volume: 200 },
      { rank: null, volume: 300 },
    ]);
    expect(result.weighted).toBeCloseTo(337, 6);
    expect(result.volume).toBe(2000);
    expect(result.score).toBeCloseTo(16.85, 6);
    expect(result.counted).toBe(4);
    expect(result.excluded).toBe(0);
  });

  it("1 位だけ・単一キーワードなら CTR × 100 がそのままスコアになる", () => {
    expect(findabilityScore([{ rank: 1, volume: 10 }]).score).toBeCloseTo(28, 6);
    expect(findabilityScore([{ rank: 10, volume: 10 }]).score).toBeCloseTo(2.5, 6);
  });

  it("キーワードが 0 件なら null（0 点ではない）", () => {
    const result = findabilityScore([]);
    expect(result.score).toBeNull();
    expect(result.counted).toBe(0);
    expect(result.excluded).toBe(0);
  });

  it("全件圏外ならスコア 0（分母はある）", () => {
    const result = findabilityScore([
      { rank: null, volume: 100 },
      { rank: null, volume: 900 },
    ]);
    expect(result.score).toBe(0);
    expect(result.volume).toBe(1000);
    expect(result.counted).toBe(2);
  });

  it("月間検索数が未登録のキーワードは分子・分母の両方から外して件数を返す", () => {
    const result = findabilityScore([
      { rank: 1, volume: 1000 },
      { rank: 1, volume: null },
      { rank: 50, volume: undefined },
      { rank: 2, volume: Number.NaN },
      { rank: 2, volume: -5 },
    ]);
    // 未登録の 4 件は無視され、1 位 × 1000 だけが残る
    expect(result.counted).toBe(1);
    expect(result.excluded).toBe(4);
    expect(result.volume).toBe(1000);
    expect(result.score).toBeCloseTo(28, 6);
  });

  it("月間検索数が全部 0 なら分母 0 なので null", () => {
    const result = findabilityScore([
      { rank: 1, volume: 0 },
      { rank: 5, volume: 0 },
    ]);
    expect(result.score).toBeNull();
    expect(result.counted).toBe(2);
    expect(result.excluded).toBe(0);
  });

  it("未計測（undefined）の順位は圏外扱いにせず計算から外す", () => {
    const only = findabilityScore([{ rank: undefined, volume: 100 }]);
    expect(only.score).toBeNull();
    expect(only.counted).toBe(0);
    expect(only.unmeasured).toBe(1);

    // 20 件登録・10 件だけ計測して全部 1 位なら、スコアは 28（未計測で薄めない）
    const items = [
      ...Array.from({ length: 10 }, () => ({ rank: 1, volume: 100 })),
      ...Array.from({ length: 10 }, () => ({ rank: undefined, volume: 100 })),
    ];
    const partial = findabilityScore(items);
    expect(partial.score).toBeCloseTo(28, 6);
    expect(partial.counted).toBe(10);
    expect(partial.unmeasured).toBe(10);
  });
});

describe("formatFindability", () => {
  it("小数 1 桁、計算できないときは —", () => {
    expect(formatFindability(16.85)).toBe("16.9");
    expect(formatFindability(0)).toBe("0.0");
    expect(formatFindability(null)).toBe("—");
  });
});
