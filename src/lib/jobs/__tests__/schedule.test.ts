import { describe, expect, it } from "vitest";
import { dueJobs, JOB_SCHEDULE, scheduleOf } from "../schedule";
import { JOB_IDS } from "../types";

describe("ジョブの振り分け", () => {
  it("すべてのジョブに予定がある", () => {
    expect(JOB_SCHEDULE.map((s) => s.id).sort()).toEqual([...JOB_IDS].sort());
  });

  it("月曜: 投稿 + マップ診断 + 再診断。火曜: 順位。水曜: 監視", () => {
    // 2026-09-21（月）5:00 JST = 20:00 UTC の前日
    expect(dueJobs(new Date("2026-09-20T20:00:00Z"))).toEqual(["gbp-posts", "maps-refresh", "seo-reanalysis"]);
    expect(dueJobs(new Date("2026-09-21T20:00:00Z"))).toEqual(["gbp-posts", "rank-weekly", "seo-reanalysis"]);
    expect(dueJobs(new Date("2026-09-22T20:00:00Z"))).toEqual(["gbp-posts", "site-monitor", "seo-reanalysis"]);
  });

  it("1 日: 月次レポート。2 日: 掲載の再チェック（2026-10-01 は木曜）", () => {
    expect(dueJobs(new Date("2026-09-30T20:00:00Z"))).toEqual(["gbp-posts", "monthly-report", "seo-reanalysis"]);
    expect(dueJobs(new Date("2026-10-01T20:00:00Z"))).toEqual(["gbp-posts", "listings-recheck", "seo-reanalysis"]);
  });

  it("次回の予定（水曜の監視は次の水曜 5:00）", () => {
    expect(scheduleOf("site-monitor").next(new Date("2026-09-20T03:00:00Z")).toISOString()).toBe("2026-09-22T20:00:00.000Z");
    expect(scheduleOf("monthly-report").next(new Date("2026-09-20T03:00:00Z")).toISOString()).toBe("2026-09-30T20:00:00.000Z");
    expect(() => scheduleOf("nope" as never)).toThrow();
  });
});
