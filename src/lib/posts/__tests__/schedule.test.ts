import { describe, expect, it } from "vitest";
import { toLocalPostBody } from "@/lib/google/business-profile";
import { defaultScheduleDates, fromLocalInput, isDue, sortPosts, toLocalInput, validatePost } from "../schedule";
import type { GbpPost } from "../types";

describe("投稿の予定", () => {
  it("次の月曜 10:00 JST から毎週", () => {
    // 2026-09-20（日）
    const dates = defaultScheduleDates(new Date("2026-09-20T03:00:00Z"), 3);
    expect(dates).toEqual(["2026-09-21T01:00:00.000Z", "2026-09-28T01:00:00.000Z", "2026-10-05T01:00:00.000Z"]);
    expect(defaultScheduleDates(new Date("2026-09-20T03:00:00Z"), 0)).toEqual([]);
  });

  it("画面の日時（JST）と ISO の往復", () => {
    expect(toLocalInput("2026-09-21T01:00:00.000Z")).toBe("2026-09-21T10:00");
    expect(fromLocalInput("2026-09-21T10:00")).toBe("2026-09-21T01:00:00.000Z");
    expect(fromLocalInput("x")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });

  it("検査: 本文・題名・期間・ボタンの URL", () => {
    const base = { topicType: "STANDARD" as const, title: "", summary: "本文", ctaType: "NONE" as const, ctaUrl: "", eventStart: null, eventEnd: null };
    expect(validatePost(base)).toEqual([]);
    expect(validatePost({ ...base, summary: " " })).toEqual(["本文を入力してください"]);
    expect(validatePost({ ...base, topicType: "EVENT" })).toEqual(["イベント・クーポンには題名が要ります", "開始日（YYYY-MM-DD）を入力してください", "終了日（YYYY-MM-DD）を入力してください"]);
    expect(validatePost({ ...base, topicType: "OFFER", title: "特典", eventStart: "2026-10-02", eventEnd: "2026-10-01" })).toEqual(["終了日は開始日より後にしてください"]);
    expect(validatePost({ ...base, ctaType: "BOOK" })).toEqual(["ボタンのリンク先（https://…）を入力してください"]);
    expect(validatePost({ ...base, ctaType: "CALL" })).toEqual([]);
  });

  it("予定時刻を過ぎた予約済みだけが対象。並びは予約 → 下書き → 済み", () => {
    const now = new Date("2026-09-21T01:00:00Z");
    expect(isDue({ status: "scheduled", scheduledAt: "2026-09-21T01:00:00Z" }, now)).toBe(true);
    expect(isDue({ status: "scheduled", scheduledAt: "2026-09-21T01:00:01Z" }, now)).toBe(false);
    expect(isDue({ status: "draft", scheduledAt: "2026-09-20T01:00:00Z" }, now)).toBe(false);
    const p = (id: string, status: GbpPost["status"], scheduledAt: string | null, createdAt = "2026-09-01T00:00:00Z"): GbpPost => ({
      id, placeId: "p", locationName: null, topicType: "STANDARD", title: "", summary: "", ctaType: "NONE", ctaUrl: "", eventStart: null, eventEnd: null, status, scheduledAt, publishedAt: null, googleName: null, error: null, createdAt, updatedAt: createdAt,
    });
    const sorted = sortPosts([p("a", "published", "2026-09-01T00:00:00Z"), p("b", "draft", null), p("c", "scheduled", "2026-09-28T00:00:00Z"), p("d", "scheduled", "2026-09-21T00:00:00Z")]);
    expect(sorted.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("Google に送る本文", () => {
  it("最新情報は本文だけ。イベントは題名と期間。ボタンは種類と URL（CALL は URL 無し）", () => {
    expect(toLocalPostBody({ topicType: "STANDARD", summary: " 本文 " })).toEqual({ languageCode: "ja", summary: "本文", topicType: "STANDARD" });
    expect(toLocalPostBody({ topicType: "EVENT", summary: "x", title: "秋祭り", eventStart: "2026-10-01", eventEnd: "2026-10-03", ctaType: "BOOK", ctaUrl: "https://x.jp/" })).toEqual({
      languageCode: "ja",
      summary: "x",
      topicType: "EVENT",
      event: { title: "秋祭り", schedule: { startDate: { year: 2026, month: 10, day: 1 }, endDate: { year: 2026, month: 10, day: 3 } } },
      callToAction: { actionType: "BOOK", url: "https://x.jp/" },
    });
    expect(toLocalPostBody({ topicType: "STANDARD", summary: "x", ctaType: "CALL" }).callToAction).toEqual({ actionType: "CALL" });
  });
});
