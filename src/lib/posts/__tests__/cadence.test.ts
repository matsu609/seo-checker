/**
 * 投稿の頻度（週ごとの本数）。
 * 「週 1 回を続けられているか」がこの画面の目的なので、0 本の週も並ぶことを固定する。
 */
import { describe, expect, it } from "vitest";
import { IDEAL_PER_WEEK, weeklyCadence, weeksWithPost, WEEKS_AHEAD, WEEKS_BACK } from "../cadence";
import type { GbpPost } from "../types";

/** 日本時間の 2026-09-22（火）12:00。その週の月曜は 2026-09-21 */
const NOW = new Date("2026-09-22T03:00:00Z");

function post(partial: Partial<GbpPost>): GbpPost {
  return {
    id: partial.id ?? "p1",
    placeId: "place",
    locationName: null,
    topicType: "STANDARD",
    title: "",
    summary: "",
    ctaType: "NONE",
    ctaUrl: "",
    eventStart: null,
    eventEnd: null,
    status: "draft",
    scheduledAt: null,
    publishedAt: null,
    googleName: null,
    error: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
    ...partial,
  };
}

describe("週ごとの本数", () => {
  it("過去 8 週 + 今週 + 先 4 週が、投稿が無くても 0 本として並ぶ", () => {
    const weeks = weeklyCadence([], { now: NOW });
    expect(weeks).toHaveLength(WEEKS_BACK + 1 + WEEKS_AHEAD);
    expect(weeks[WEEKS_BACK]!.weekStart).toBe("2026-09-21");
    for (const w of weeks) expect(w.published + w.scheduled).toBe(0);
  });

  it("投稿済みは publishedAt の週、予約済みは scheduledAt の週に入る", () => {
    const weeks = weeklyCadence(
      [
        post({ id: "a", status: "published", publishedAt: "2026-09-22T01:00:00Z" }),
        post({ id: "b", status: "published", publishedAt: "2026-09-16T01:00:00Z" }),
        post({ id: "c", status: "scheduled", scheduledAt: "2026-09-29T01:00:00Z" }),
      ],
      { now: NOW },
    );
    const at = (weekStart: string) => weeks.find((w) => w.weekStart === weekStart)!;
    expect(at("2026-09-21").published).toBe(1);
    expect(at("2026-09-14").published).toBe(1);
    expect(at("2026-09-28").scheduled).toBe(1);
  });

  it("下書き・失敗・取り消しは数えない（Google マップに出ていないため）", () => {
    const weeks = weeklyCadence(
      [
        post({ id: "a", status: "draft", scheduledAt: "2026-09-22T01:00:00Z" }),
        post({ id: "b", status: "failed", scheduledAt: "2026-09-22T01:00:00Z" }),
        post({ id: "c", status: "cancelled", scheduledAt: "2026-09-22T01:00:00Z" }),
      ],
      { now: NOW },
    );
    for (const w of weeks) expect(w.published + w.scheduled).toBe(0);
  });

  it("範囲の外の古い投稿は落ちる（図が伸びすぎない）", () => {
    const weeks = weeklyCadence([post({ status: "published", publishedAt: "2026-01-05T01:00:00Z" })], { now: NOW });
    expect(weeks.reduce((a, w) => a + w.published, 0)).toBe(0);
  });

  it("日本時間の週で数える（UTC の日曜夜は日本では月曜）", () => {
    // UTC 2026-09-20(日) 23:00 = JST 2026-09-21(月) 08:00 → 2026-09-21 の週
    const weeks = weeklyCadence([post({ status: "published", publishedAt: "2026-09-20T23:00:00Z" })], { now: NOW });
    expect(weeks.find((w) => w.weekStart === "2026-09-21")!.published).toBe(1);
  });
});

describe("投稿できた週の数", () => {
  it("今週までを数え、先の予約は含めない", () => {
    const weeks = weeklyCadence(
      [
        post({ id: "a", status: "published", publishedAt: "2026-09-22T01:00:00Z" }),
        post({ id: "b", status: "published", publishedAt: "2026-09-16T01:00:00Z" }),
        post({ id: "c", status: "scheduled", scheduledAt: "2026-09-29T01:00:00Z" }),
      ],
      { now: NOW },
    );
    expect(weeksWithPost(weeks, NOW)).toEqual({ covered: 2, total: WEEKS_BACK + 1 });
  });

  it("理想は週 1 本", () => {
    expect(IDEAL_PER_WEEK).toBe(1);
  });
});
