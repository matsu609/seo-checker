import { describe, expect, it } from "vitest";
import { findFeatureByPath } from "@/lib/features/registry";
import { ONBOARDING_STEPS } from "../steps";

describe("はじめかたの手順", () => {
  it("番号が 1 から連番になっている", () => {
    expect(ONBOARDING_STEPS.map((s) => s.n)).toEqual([1, 2, 3]);
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

  // Google 連携も計測タグも、お客様側の作業が要るので手順に置かない（利用者の決定 2026-09-17）
  it("お客様側の作業（Google 連携・計測タグ）を求める手順が無い", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.body).not.toContain("Search Console");
      expect(step.body).not.toContain("計測タグ");
    }
    expect(ONBOARDING_STEPS[1].href).toBe("/tools/maps");
  });
});
