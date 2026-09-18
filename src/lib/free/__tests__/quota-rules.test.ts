/**
 * 無料診断の回数（純粋な部分）。
 */
import { describe, expect, it } from "vitest";
import { FREE_RUN_LIMIT_DEFAULT, FREE_RUNS_KEY, freeRunsFromMetadata, isExhausted, quotaOf, unlimitedQuota } from "../quota-rules";

describe("無料診断の回数", () => {
  it("既定は 2 回（サイト + 店舗の合計。利用者の決定 2026-09-18）", () => {
    expect(FREE_RUN_LIMIT_DEFAULT).toBe(2);
  });

  it("privateMetadata から使った回数を読む。無い・壊れている・負の値は 0", () => {
    expect(freeRunsFromMetadata(null)).toBe(0);
    expect(freeRunsFromMetadata({})).toBe(0);
    expect(freeRunsFromMetadata({ [FREE_RUNS_KEY]: 1 })).toBe(1);
    expect(freeRunsFromMetadata({ [FREE_RUNS_KEY]: 2.7 })).toBe(2);
    expect(freeRunsFromMetadata({ [FREE_RUNS_KEY]: -3 })).toBe(0);
    expect(freeRunsFromMetadata({ [FREE_RUNS_KEY]: "2" })).toBe(0);
  });

  it("残りと使い切りの判定", () => {
    expect(quotaOf(0, 2)).toEqual({ limit: 2, used: 0, remaining: 2, unlimited: false, reason: null });
    expect(quotaOf(2, 2).remaining).toBe(0);
    expect(quotaOf(5, 2).remaining).toBe(0);
    expect(isExhausted(quotaOf(2, 2))).toBe(true);
    expect(isExhausted(quotaOf(1, 2))).toBe(false);
    // 運用者・契約済み・認証無効は使い切らない
    expect(isExhausted(unlimitedQuota("admin", 2))).toBe(false);
    expect(isExhausted(null)).toBe(false);
  });
});

describe("運用者・代理店のデモ用の枠（月 50 回）", () => {
  it("既定は月 50 回", async () => {
    const { DEMO_RUN_LIMIT_DEFAULT } = await import("../quota-rules");
    expect(DEMO_RUN_LIMIT_DEFAULT).toBe(50);
  });

  it("月のキーは日本時間", async () => {
    const { monthKey } = await import("../quota-rules");
    // UTC 9/30 23:00 = JST 10/1 08:00
    expect(monthKey(new Date("2026-09-30T23:00:00Z"))).toBe("2026-10");
    expect(monthKey(new Date("2026-09-30T10:00:00Z"))).toBe("2026-09");
  });

  it("今月の回数だけを読む。月が違えば 0（自動でリセット）", async () => {
    const { DEMO_RUNS_KEY, demoRunsFromMetadata, demoQuotaOf, isExhausted } = await import("../quota-rules");
    expect(demoRunsFromMetadata(null, "2026-09")).toBe(0);
    expect(demoRunsFromMetadata({ [DEMO_RUNS_KEY]: { month: "2026-09", used: 12 } }, "2026-09")).toBe(12);
    expect(demoRunsFromMetadata({ [DEMO_RUNS_KEY]: { month: "2026-08", used: 50 } }, "2026-09")).toBe(0);
    expect(demoRunsFromMetadata({ [DEMO_RUNS_KEY]: 5 }, "2026-09")).toBe(0);
    const q = demoQuotaOf(49, 50);
    expect(q).toEqual({ limit: 50, used: 49, remaining: 1, unlimited: false, reason: "demo", period: "month" });
    expect(isExhausted(demoQuotaOf(50, 50))).toBe(true);
  });
});
