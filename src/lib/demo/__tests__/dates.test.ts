/**
 * 見本の横軸に使う日付。
 *
 * いちばん大事なのは **日付が未来であること**。過去の日付で描くと、
 * 見本が「もう測った数字」に見えてしまう（利用者の指示 2026-09-22）。
 */
import { describe, expect, it } from "vitest";
import { comingMonths, comingWeekdays, dayLabel, monthLabel } from "../dates";

/** 日本時間の 2026-09-22（火）12:00 */
const TUE = new Date("2026-09-22T03:00:00Z");

describe("これから来る曜日", () => {
  it("次の月曜から 1 週間ごとに並ぶ", () => {
    expect(comingWeekdays(4, 1, TUE)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("今日がその曜日でも、5:00 の定期実行を過ぎていればもう測った日なので次の週から（2026-09-23 に修正）", () => {
    expect(comingWeekdays(2, 2, TUE)).toEqual(["2026-09-29", "2026-10-06"]);
  });

  it("今日がその曜日で、5:00 の定期実行より前なら今日から数える", () => {
    // 2026-09-22（火）4:59 JST
    expect(comingWeekdays(2, 2, new Date("2026-09-21T19:59:00Z"))).toEqual(["2026-09-22", "2026-09-29"]);
    // ちょうど 5:00 は「もう走った」側
    expect(comingWeekdays(1, 2, new Date("2026-09-21T20:00:00Z"))).toEqual(["2026-09-29"]);
  });

  it("必ず今日より後の計測日になる（見本を過去に描かない）", () => {
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      for (const d of comingWeekdays(4, weekday, TUE)) expect(d > "2026-09-22").toBe(true);
    }
  });

  it("年をまたいでも正しく進む", () => {
    // 2026-12-29 は火曜。次の水曜は 12/30
    expect(comingWeekdays(3, 3, new Date("2026-12-29T03:00:00Z"))).toEqual(["2026-12-30", "2027-01-06", "2027-01-13"]);
  });

  it("日本時間で数える（UTC では前日でも日本の日付で並ぶ）", () => {
    // UTC 2026-09-22 18:00 = JST 2026-09-23（水）03:00（定期実行の前）
    expect(comingWeekdays(1, 3, new Date("2026-09-22T18:00:00Z"))).toEqual(["2026-09-23"]);
    // UTC 2026-09-22 23:00 = JST 2026-09-23（水）08:00（定期実行のあと）
    expect(comingWeekdays(1, 3, new Date("2026-09-22T23:00:00Z"))).toEqual(["2026-09-30"]);
  });
});

describe("これから来る月", () => {
  it("今月から並ぶ", () => {
    expect(comingMonths(3, TUE)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("年をまたぐ", () => {
    expect(comingMonths(3, new Date("2026-11-15T03:00:00Z"))).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("目盛りの表記", () => {
  it("日付は M/D、月は N 月", () => {
    expect(dayLabel("2026-09-22")).toBe("9/22");
    expect(monthLabel("2026-09")).toBe("9 月");
  });

  it("ISO でなければそのまま返す", () => {
    expect(dayLabel("不明")).toBe("不明");
    expect(monthLabel("不明")).toBe("不明");
  });
});
