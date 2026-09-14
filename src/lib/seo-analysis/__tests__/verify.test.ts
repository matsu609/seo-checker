import { describe, expect, it } from "vitest";
import { numbersIn, unknownFactIds, unverifiedNumbers } from "../ai/verify";
import type { Fact } from "../sheet/types";

const facts: Fact[] = [
  { id: "S-01", area: "structure", label: "内部リンクの延べ本数", value: "1,240 本", note: "1 ページあたり平均 12.4 本" },
  { id: "P-01", area: "speed", label: "LCP", value: "2.8 秒（改善が必要）" },
  { id: "G-01", area: "google", label: "CTR", value: "CTR 3%" },
];

describe("数値の照合", () => {
  it("4 以上の整数と小数だけを見て、年は除く", () => {
    expect(numbersIn("3 つの理由と 12 ページ、2026 年、1.5 倍")).toEqual(["12", "1.5"]);
  });

  it("事実シートにある数値（桁区切り・単位換算）は通す", () => {
    expect(unverifiedNumbers(["内部リンクは 1240 本で、1,240 本のうち平均 12.4 本"], facts)).toEqual([]);
    // 2.8 秒 → 2800 ms、3% → 0.03 も通す
    expect(unverifiedNumbers(["LCP は 2800 ms、CTR は 0.03"], facts)).toEqual([]);
  });

  it("無い数値を挙げる", () => {
    expect(unverifiedNumbers(["CTR を 8% に上げれば 500 クリック増える"], facts)).toEqual(["8", "500"]);
  });

  it("存在しない事実 ID を挙げる", () => {
    expect(unknownFactIds(["S-01", "Z-99", "P-01", "Z-99"], facts)).toEqual(["Z-99"]);
  });
});
