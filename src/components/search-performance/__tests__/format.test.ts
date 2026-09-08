import { describe, expect, it } from "vitest";
import { changeRate, formatCtr, formatInt, formatPosition, shortenUrl } from "../format";

describe("検索パフォーマンスの表示整形", () => {
  it("CTR は 0〜1 の値をパーセントにする", () => {
    expect(formatCtr(0.0353)).toBe("3.5%");
    expect(formatCtr(0)).toBe("0.0%");
    expect(formatCtr(1)).toBe("100.0%");
  });

  it("掲載順位は 0 を「—」にする（データが無いのに 0.0 位と出さない）", () => {
    expect(formatPosition(8.42)).toBe("8.4");
    expect(formatPosition(0)).toBe("—");
  });

  it("整数は 3 桁区切り", () => {
    expect(formatInt(12345)).toBe("12,345");
    expect(formatInt(0.6)).toBe("1");
  });

  // 前期が 0 のときに Infinity や NaN を出さない
  it("前期が 0 なら変化率は出さない", () => {
    expect(changeRate(10, 0)).toBeNull();
    expect(changeRate(0, 0)).toBeNull();
    expect(changeRate(15, 10)).toBeCloseTo(50, 6);
    expect(changeRate(5, 10)).toBeCloseTo(-50, 6);
  });

  it("URL はホストを外してパスだけ見せる", () => {
    expect(shortenUrl("https://example.com/blog/post?id=1")).toBe("/blog/post?id=1");
    expect(shortenUrl("https://example.com/")).toBe("/");
    expect(shortenUrl("not a url")).toBe("not a url");
    expect(shortenUrl("https://example.com/" + "a".repeat(80), 20)).toHaveLength(20);
  });
});
