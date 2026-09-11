/**
 * 集計と CSV（純粋関数）。押下率は「押した割合」であって実投稿数ではない。
 */
import { describe, expect, it } from "vitest";
import { csvCell, responsesToCsv } from "../csv";
import type { ReviewChannel } from "../forms";
import { computeMetrics, weekStartOf } from "../metrics";
import type { ReviewQuestion } from "../questions";
import type { ReviewResponse } from "../responses";

const CH: ReviewChannel[] = [
  { id: "c1", formId: "f", code: "aaa111", label: "テーブル 1", storeName: null, placeId: null, writeReviewUrl: null, createdAt: "2026-09-01T00:00:00Z" },
  { id: "c2", formId: "f", code: "bbb222", label: "レジ", storeName: "駅前店", placeId: "ChIJekimae", writeReviewUrl: "https://example.test/w", createdAt: "2026-09-01T00:00:00Z" },
];

function resp(over: Partial<ReviewResponse>): ReviewResponse {
  return {
    id: "r",
    formId: "f",
    channelId: "c1",
    rating: 5,
    answers: {},
    isLow: false,
    draft: null,
    draftSource: "none",
    draftFinal: null,
    directMessage: null,
    directContact: null,
    clickedReviewAt: null,
    clickedDirectAt: null,
    status: "open",
    note: null,
    handledAt: null,
    lang: null,
    createdAt: "2026-09-10T03:00:00Z",
    ...over,
  };
}

const LIST: ReviewResponse[] = [
  resp({ id: "1", rating: 5, clickedReviewAt: "2026-09-10T03:01:00Z" }),
  resp({ id: "2", rating: 4, channelId: "c2" }),
  resp({ id: "3", rating: 1, isLow: true, directMessage: "遅い", createdAt: "2026-09-03T03:00:00Z" }),
  resp({ id: "4", rating: null, channelId: "gone", createdAt: "2026-09-03T03:00:00Z", clickedReviewAt: "2026-09-03T03:02:00Z" }),
];

describe("集計", () => {
  it("件数・平均・分布・押下率・経路別・週別", () => {
    const m = computeMetrics(LIST, CH);
    expect(m.total).toBe(4);
    expect(m.averageRating).toBe(3.33);
    expect(m.distribution).toEqual([1, 0, 0, 1, 1]);
    expect(m.low).toBe(1);
    expect(m.lowOpen).toBe(1);
    expect(m.reviewClicks).toBe(2);
    expect(m.reviewClickRate).toBe(50);
    expect(m.directMessages).toBe(1);
    expect(m.byChannel.map((c) => [c.label, c.total])).toEqual([
      ["テーブル 1", 2],
      ["駅前店（レジ）", 1],
      ["QR なし（直リンク）", 1],
    ]);
    expect(m.byWeek.map((w) => [w.weekStart, w.total, w.reviewClicks])).toEqual([
      ["2026-09-07", 2, 1],
      ["2026-08-31", 2, 1],
    ]);
  });

  it("回答が無ければ押下率は null", () => {
    const m = computeMetrics([], CH);
    expect(m.reviewClickRate).toBeNull();
    expect(m.averageRating).toBeNull();
    expect(m.byChannel.map((c) => c.total)).toEqual([0, 0]);
  });

  it("週の開始は JST の月曜", () => {
    expect(weekStartOf("2026-09-13T20:00:00Z")).toBe("2026-09-14"); // JST 9/14（月）5:00
    expect(weekStartOf("2026-09-13T14:00:00Z")).toBe("2026-09-07"); // JST 9/13（日）23:00
    expect(weekStartOf("bad")).toBe("");
  });
});

describe("CSV", () => {
  const QS: ReviewQuestion[] = [
    { id: "rating01", type: "rating", label: "満足度", options: [], required: true },
    { id: "text0001", type: "text", label: "感想", options: [], required: false },
  ];

  it("式インジェクションを無効化し、区切り・改行・引用符をエスケープする", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell('a,b"c\nd')).toBe('"a,b""c\nd"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(3)).toBe("3");
  });

  it("見出しに質問文が入り、行に店舗・回答・下書き・対応状態が入る", () => {
    const form = { questions: QS, storeName: "本店", writeReviewUrl: null };
    const csv = responsesToCsv(
      [
        resp({ id: "a", rating: 2, isLow: true, answers: { rating01: 2, text0001: "=悪い" }, draft: "下書き", status: "done" }),
        resp({ id: "b", channelId: "c2", rating: 5, answers: { rating01: 5 }, lang: "en" }),
      ],
      form,
      CH,
    );
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toContain("回答日時,店舗,経路（QR）,評価,低評価,言語,満足度,感想,AI 下書き");
    expect(lines[1]).toContain("本店,テーブル 1,2,はい,日本語,2 / 5,'=悪い,下書き");
    expect(lines[1]).toContain("対応済み");
    expect(lines[2]).toContain("駅前店,レジ,5,,英語,5 / 5");
    expect(csv.startsWith("﻿")).toBe(true);
  });
});
