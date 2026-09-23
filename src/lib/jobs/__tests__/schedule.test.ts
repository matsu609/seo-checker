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
    // 2 日は掲載の再チェックの予定日。月次レポートは取り返しの日（済んでいれば runner が飛ばす。2026-09-23）
    expect(dueJobs(new Date("2026-10-01T20:00:00Z"))).toEqual(["gbp-posts", "monthly-report", "listings-recheck", "seo-reanalysis"]);
  });

  it("月次のジョブは予定日から 2 日だけ取り返す（1 日なら 3 日まで、2 日なら 4 日まで）", () => {
    // 10/3（土）: レポートの最終日・再チェックの取り返し
    expect(dueJobs(new Date("2026-10-02T20:00:00Z"))).toEqual(["gbp-posts", "monthly-report", "listings-recheck", "seo-reanalysis"]);
    // 10/4（日）: 再チェックの最終日
    expect(dueJobs(new Date("2026-10-03T20:00:00Z"))).toEqual(["gbp-posts", "listings-recheck", "seo-reanalysis"]);
    // 10/5（月）: どちらも無い
    expect(dueJobs(new Date("2026-10-04T20:00:00Z"))).toEqual(["gbp-posts", "maps-refresh", "seo-reanalysis"]);
  });

  it("月次のジョブは曜日の重いジョブより前（1 日が火曜でも月次レポートを先に。2026-12-01）", () => {
    expect(dueJobs(new Date("2026-11-30T20:00:00Z"))).toEqual(["gbp-posts", "monthly-report", "rank-weekly", "seo-reanalysis"]);
    // 使ってよい時間に上限があり、後ろの順位計測（最低 60 秒）の時間が残る
    expect(scheduleOf("monthly-report").maxBudgetMs).toBeLessThanOrEqual(250_000 - 20_000 - scheduleOf("rank-weekly").minBudgetMs);
  });

  it("取り返しの窓は今月の予定日の 0:00（日本時間）から", () => {
    // 12/3 10:00 JST
    expect(scheduleOf("monthly-report").catchUpSince?.(new Date("2026-12-03T01:00:00Z")).toISOString()).toBe("2026-11-30T15:00:00.000Z");
    expect(scheduleOf("listings-recheck").catchUpSince?.(new Date("2026-12-03T01:00:00Z")).toISOString()).toBe("2026-12-01T15:00:00.000Z");
    expect(scheduleOf("rank-weekly").catchUpSince).toBeUndefined();
  });

  it("毎日のジョブの次回: 5:00 前なら きょう、過ぎていれば あす（1 週間後ではない）", () => {
    // 2026-09-20 22:52 JST（= 13:52 UTC）→ 9/21 5:00 JST
    expect(scheduleOf("gbp-posts").next(new Date("2026-09-20T13:52:00Z")).toISOString()).toBe("2026-09-20T20:00:00.000Z");
    // 2026-09-21 4:30 JST（= 9/20 19:30 UTC）→ 9/21 5:00 JST
    expect(scheduleOf("seo-reanalysis").next(new Date("2026-09-20T19:30:00Z")).toISOString()).toBe("2026-09-20T20:00:00.000Z");
    // 5:00 ちょうどは あす
    expect(scheduleOf("gbp-posts").next(new Date("2026-09-20T20:00:00Z")).toISOString()).toBe("2026-09-21T20:00:00.000Z");
  });

  it("次回の予定（水曜の監視は次の水曜 5:00）", () => {
    expect(scheduleOf("site-monitor").next(new Date("2026-09-20T03:00:00Z")).toISOString()).toBe("2026-09-22T20:00:00.000Z");
    expect(scheduleOf("monthly-report").next(new Date("2026-09-20T03:00:00Z")).toISOString()).toBe("2026-09-30T20:00:00.000Z");
    expect(() => scheduleOf("nope" as never)).toThrow();
  });
});
