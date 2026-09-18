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
