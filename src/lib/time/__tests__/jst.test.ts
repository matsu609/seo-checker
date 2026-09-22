import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatJstShort, isMonthKey, jstDate, jstDateKey, jstMonthKey, jstParts, jstWeekStart, monthRangeJst, nextMonthDayAtJst, nextWeekdayAtJst, previousMonthKey } from "../jst";

describe("日本時間の計算", () => {
  it("UTC の 15:00 は日本の翌日 0:00", () => {
    const p = jstParts(new Date("2026-09-30T15:00:00Z"));
    expect(p).toMatchObject({ year: 2026, month: 10, day: 1, hour: 0, minute: 0, weekday: 4 });
    expect(jstDateKey(new Date("2026-09-30T15:00:00Z"))).toBe("2026-10-01");
    expect(jstMonthKey(new Date("2026-09-30T14:59:00Z"))).toBe("2026-09");
  });

  it("壁時計 → UTC と、月の範囲", () => {
    expect(jstDate(2026, 10, 1, 5).toISOString()).toBe("2026-09-30T20:00:00.000Z");
    expect(monthRangeJst("2026-09")).toEqual({ start: "2026-08-31T15:00:00.000Z", end: "2026-09-30T15:00:00.000Z" });
    expect(monthRangeJst("2026-12").end).toBe("2026-12-31T15:00:00.000Z");
    expect(() => monthRangeJst("2026-13")).toThrow();
  });

  it("前月と月キーの形", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(previousMonthKey("2026-09")).toBe("2026-08");
    expect(isMonthKey("2026-09")).toBe(true);
    expect(isMonthKey("2026-9")).toBe(false);
  });

  it("次の曜日 5:00 と次の 1 日 5:00", () => {
    // 2026-09-20 は日曜。次の火曜 5:00 JST = 9/22 5:00 JST = 9/21 20:00 UTC
    const sun = new Date("2026-09-20T03:00:00Z");
    expect(nextWeekdayAtJst(sun, 2, 5).toISOString()).toBe("2026-09-21T20:00:00.000Z");
    // 火曜 5:00 ちょうどなら翌週
    expect(nextWeekdayAtJst(new Date("2026-09-21T20:00:00Z"), 2, 5).toISOString()).toBe("2026-09-28T20:00:00.000Z");
    expect(nextMonthDayAtJst(sun, 1, 5).toISOString()).toBe("2026-09-30T20:00:00.000Z");
    expect(nextMonthDayAtJst(new Date("2026-09-30T20:00:00Z"), 1, 5).toISOString()).toBe("2026-10-31T20:00:00.000Z");
    expect(formatJstShort(new Date("2026-09-21T20:00:00Z"))).toBe("9/22（火）5:00");
  });

  it("週の始まり（月曜）", () => {
    // 2026-09-22 は火曜 → その週の月曜は 9/21
    expect(jstWeekStart(new Date("2026-09-22T03:00:00Z"))).toBe("2026-09-21");
    // 月曜そのもの
    expect(jstWeekStart(new Date("2026-09-21T03:00:00Z"))).toBe("2026-09-21");
    // 日曜は前の月曜（週の最終日）
    expect(jstWeekStart(new Date("2026-09-27T03:00:00Z"))).toBe("2026-09-21");
    // UTC では日曜でも、日本時間で月曜ならその週
    expect(jstWeekStart(new Date("2026-09-20T23:00:00Z"))).toBe("2026-09-21");
    // 月をまたぐ
    expect(jstWeekStart(new Date("2026-10-01T03:00:00Z"))).toBe("2026-09-28");
  });

  it("日数", () => {
    expect(addDays(new Date("2026-01-01T00:00:00Z"), 31).toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(daysBetween("2026-01-01T00:00:00Z", "2026-01-31T00:00:00Z")).toBe(30);
  });
});
