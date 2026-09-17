import { describe, expect, it } from "vitest";
import { findFeatureByPath } from "@/lib/features/registry";
import { ONBOARDING_STEPS } from "../steps";

describe("はじめかたの手順", () => {
  it("番号が 1 から連番になっている", () => {
    expect(ONBOARDING_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4]);
  });

  it("リンク先はすべて実在する画面", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(findFeatureByPath(step.href), step.href).toBeTruthy();
    }
  });

  it("最初の手順はホームページの登録（設定画面）", () => {
    expect(ONBOARDING_STEPS[0].href).toBe("/settings");
    expect(ONBOARDING_STEPS[0].body).toContain("打ち直す必要はありません");
  });

  // Google 連携（Search Console / GA4）は使わない（利用者の決定 2026-09-17）。代わりに自前の計測タグ
  it("2 番目の手順は計測タグの設置（アクセス解析）で、Google の設定を求めない", () => {
    expect(ONBOARDING_STEPS[1].href).toBe("/tools/analytics");
    expect(ONBOARDING_STEPS[1].body).toContain("Google アナリティクスの設定は不要");
    expect(ONBOARDING_STEPS[1].body).not.toContain("Search Console");
  });
});
