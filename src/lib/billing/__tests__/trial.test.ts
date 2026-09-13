/**
 * 無料期間の日数: 未設定は既定の 30 日、0 や不正な値はトライアルなし、上限で頭打ち。
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAL_DAYS, trialDays } from "../trial";

describe("無料期間の日数", () => {
  it("未設定なら既定の 30 日（初月無料）", () => {
    expect(DEFAULT_TRIAL_DAYS).toBe(30);
    expect(trialDays(undefined)).toBe(30);
  });

  it("数字はその値。前後の空白は無視する", () => {
    expect(trialDays("7")).toBe(7);
    expect(trialDays(" 14 ")).toBe(14);
  });

  it("0・負の数・数字でない値はトライアルなし", () => {
    for (const raw of ["0", "-1", "", "  ", "なし", "abc"]) expect(trialDays(raw), raw).toBe(0);
  });

  it("Stripe の上限 730 日で頭打ち", () => {
    expect(trialDays("1000")).toBe(730);
    expect(trialDays("730")).toBe(730);
  });
});
