/**
 * 機能の個別開放のテスト。
 * ここが崩れると「開けたはずの機能が開かない」か「消した機能 ID が残り続ける」。
 */
import { describe, expect, it } from "vitest";
import { features } from "@/lib/features/registry";
import { overridesFromMetadata, parseFeatureOverrides, toggleOverride } from "../overrides";
import { resolveUserPlan } from "../resolve";

const REAL = features[0].id;
const OTHER = features[1].id;

describe("開放リストの読み取り", () => {
  it("レジストリにある ID だけ残す", () => {
    expect(parseFeatureOverrides([REAL, "nope"])).toEqual([REAL]);
  });

  it("重複を落として並びを固定する", () => {
    const parsed = parseFeatureOverrides([OTHER, REAL, REAL]);
    expect(parsed).toEqual([...new Set([REAL, OTHER])].sort());
  });

  it("壊れた値は空", () => {
    expect(parseFeatureOverrides(null)).toEqual([]);
    expect(parseFeatureOverrides("improvement")).toEqual([]);
    expect(parseFeatureOverrides([1, {}, null])).toEqual([]);
  });

  it("publicMetadata から取り出す", () => {
    expect(overridesFromMetadata({ featureOverrides: [REAL] })).toEqual([REAL]);
    expect(overridesFromMetadata({ plan: "pro" })).toEqual([]);
    expect(overridesFromMetadata(null)).toEqual([]);
    expect(overridesFromMetadata("x")).toEqual([]);
  });
});

describe("開放の切り替え", () => {
  it("追加できる", () => {
    expect(toggleOverride([], REAL, true)).toEqual([REAL]);
  });

  it("外せる", () => {
    expect(toggleOverride([REAL], REAL, false)).toEqual([]);
  });

  it("二重に追加しても増えない", () => {
    expect(toggleOverride([REAL], REAL, true)).toEqual([REAL]);
  });

  it("他の機能は触らない", () => {
    expect(toggleOverride([REAL, OTHER], REAL, false)).toEqual([OTHER]);
  });

  it("知らない ID は入らない", () => {
    expect(toggleOverride([], "nope", true)).toEqual([]);
  });
});

describe("他ユーザーのプラン判定", () => {
  // getCurrentPlan と同じ順番であること。ずれるとマスター画面の表示と実態が食い違う
  it("契約が最優先", () => {
    expect(
      resolveUserPlan({ billingPlan: "pro", metadataPlan: "standard", envDefault: "free" }),
    ).toEqual({ plan: "pro", source: "billing" });
  });

  it("契約が無ければ metadata", () => {
    expect(
      resolveUserPlan({ billingPlan: null, metadataPlan: "standard", envDefault: "free" }),
    ).toEqual({ plan: "standard", source: "metadata" });
  });

  it("metadata が無ければ環境変数", () => {
    expect(resolveUserPlan({ billingPlan: null, metadataPlan: null, envDefault: "pro" })).toEqual({
      plan: "pro",
      source: "env",
    });
  });

  it("どれも無ければ free", () => {
    expect(resolveUserPlan({ billingPlan: null, metadataPlan: null, envDefault: null })).toEqual({
      plan: "free",
      source: "default",
    });
  });

  it("metadata の知らない値は無視する", () => {
    expect(
      resolveUserPlan({ billingPlan: null, metadataPlan: "enterprise", envDefault: null }),
    ).toEqual({ plan: "free", source: "default" });
  });
});
