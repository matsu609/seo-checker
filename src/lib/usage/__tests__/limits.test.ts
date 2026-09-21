/**
 * 月の回数上限の定義を固定するテスト（利用者の決定 2026-09-21: 1 店舗の原価 3,000 円以内）。
 */
import { describe, expect, it } from "vitest";
import { findFeatureById } from "@/lib/features/registry";
import { USAGE_FEATURES, USAGE_LIMITS, usageLimitFor, usageLimitMessage, usageRemaining, usageResetsOn } from "../limits";

describe("上限の定義", () => {
  it("全部の機能がレジストリの機能 ID を指し、プランの順序（ライト ≤ スタンダード ≤ プレミアム）を守る", () => {
    for (const key of USAGE_FEATURES) {
      const m = USAGE_LIMITS[key];
      expect(m.key).toBe(key);
      expect(findFeatureById(m.featureId), m.featureId).not.toBeNull();
      expect(m.limits.standard).toBeGreaterThan(0);
      expect(m.limits.premium).toBeGreaterThanOrEqual(m.limits.standard);
      if (m.limits.light > 0) expect(m.limits.light).toBeLessThanOrEqual(m.limits.standard);
      expect(m.counts.length).toBeGreaterThan(5);
    }
  });

  it("決めた値: AI ライティング 30 / ページ診断 20 / 改修提案 20 / 手動の順位計測 300 検索", () => {
    expect(USAGE_LIMITS.writing.limits.standard).toBe(30);
    expect(USAGE_LIMITS["page-diagnosis"].limits.standard).toBe(20);
    expect(USAGE_LIMITS.improvement.limits.standard).toBe(20);
    expect(USAGE_LIMITS["rank-measure"].limits.standard).toBe(300);
  });
});

describe("誰にどの上限か", () => {
  it("運用者は無制限、プランで 0 の機能は個別開放向けにスタンダードの値", () => {
    expect(usageLimitFor("writing", "standard", true)).toBeNull();
    expect(usageLimitFor("writing", "standard", false)).toBe(30);
    expect(usageLimitFor("writing", "premium", false)).toBe(90);
    // ライトでは AI ライティングは使えない（0）→ 個別開放で開いている人はスタンダードの 30
    expect(usageLimitFor("writing", "light", false)).toBe(30);
    expect(usageLimitFor("writing", "free", false)).toBe(30);
    expect(usageLimitFor("rank-measure", "light", false)).toBe(300);
  });
});

describe("文面と日付", () => {
  it("翌月 1 日（日本時間）に戻る。年末は翌年 1 月", () => {
    expect(usageResetsOn(new Date("2026-09-21T03:00:00Z"))).toBe("2026-10-01");
    // JST では 12/31 23:30 → 翌月は 2027-01
    expect(usageResetsOn(new Date("2026-12-31T14:30:00Z"))).toBe("2027-01-01");
    // UTC 12/31 15:00 = JST 1/1 0:00 → 翌月は 2027-02
    expect(usageResetsOn(new Date("2026-12-31T15:00:00Z"))).toBe("2027-02-01");
  });
  it("上限の文面に回数と戻る日が入る", () => {
    const msg = usageLimitMessage(USAGE_LIMITS.writing, 30, 30, "2026-10-01");
    expect(msg).toContain("AI ライティング");
    expect(msg).toContain("30 回");
    expect(msg).toContain("2026 年 10 月 1 日");
  });
  it("残りは 0 未満にしない。無制限は null", () => {
    expect(usageRemaining(35, 30)).toBe(0);
    expect(usageRemaining(3, 30)).toBe(27);
    expect(usageRemaining(3, null)).toBeNull();
  });
});
