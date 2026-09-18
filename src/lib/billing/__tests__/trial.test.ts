/**
 * 無料期間の日数: 未設定はトライアルなし（0）、正の数はその値、0 や不正な値はトライアルなし、上限で頭打ち。
 * 初月無料は全員に自動で付けず、クーポン（プロモーションコード）で相手ごとに渡す（利用者の決定 2026-09-18）。
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_TRIAL_DAYS, trialDays } from "../trial";

describe("無料期間の日数", () => {
  it("未設定ならトライアルなし（初月無料は自動で付けない）", () => {
    expect(DEFAULT_TRIAL_DAYS).toBe(0);
    expect(trialDays(undefined)).toBe(0);
  });

  it("STRIPE_TRIAL_DAYS に正の数があればその値。前後の空白は無視する", () => {
    expect(trialDays("7")).toBe(7);
    expect(trialDays(" 14 ")).toBe(14);
    expect(trialDays("30")).toBe(30);
  });

  it("0・負の数・数字でない値はトライアルなし", () => {
    for (const raw of ["0", "-1", "", "  ", "なし", "abc"]) expect(trialDays(raw), raw).toBe(0);
  });

  it("Stripe の上限 730 日で頭打ち", () => {
    expect(trialDays("1000")).toBe(730);
    expect(trialDays("730")).toBe(730);
  });
});
