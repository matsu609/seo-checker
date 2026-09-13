import { describe, expect, it } from "vitest";
import { analyzeReviews, collectReviews, words } from "../review-insights";
import type { PlaceReview } from "../types";

function review(patch: Partial<PlaceReview> = {}): PlaceReview {
  return { rating: 5, text: "", author: "客", publishedAt: "2026-09-01T00:00:00Z", relative: null, ...patch };
}

describe("口コミの集約", () => {
  it("週をまたいで重なった口コミを二重に数えない", () => {
    const a = review({ text: "カットが丁寧でした", publishedAt: "2026-09-01T00:00:00Z" });
    const b = review({ text: "縮毛矯正がきれいに仕上がりました", publishedAt: "2026-08-20T00:00:00Z" });
    const c = review({ text: "駐車場が分かりにくい", publishedAt: "2026-09-05T00:00:00Z", rating: 2 });
    const all = collectReviews([[c, a], [a, b]]);
    expect(all).toHaveLength(3);
    // 新しい順
    expect(all.map((r) => r.publishedAt)).toEqual([
      "2026-09-05T00:00:00Z",
      "2026-09-01T00:00:00Z",
      "2026-08-20T00:00:00Z",
    ]);
  });
});

describe("語の取り出し", () => {
  it("漢字 2 文字以上・カタカナ 3 文字以上・英字 3 文字以上を拾い、一般語は除く", () => {
    expect(words("カットが丁寧で、スタッフの対応も良かった")).toEqual(expect.arrayContaining(["カット", "丁寧"]));
    // 「対応」は一般語なので数えない
    expect(words("対応が良い")).not.toContain("対応");
    // 1 件の中で連呼されても 1 回
    expect(words("丁寧 丁寧 丁寧").filter((w) => w === "丁寧")).toHaveLength(1);
  });
});

describe("傾向の分析", () => {
  const reviews = [
    review({ text: "カットが丁寧で仕上がりもきれいでした", rating: 5 }),
    review({ text: "カットは丁寧ですが待ち時間が長かった", rating: 3 }),
    review({ text: "縮毛矯正をお願いしました。丁寧な説明で安心", rating: 5 }),
    review({ text: "予約が取れない。電話が繋がらない", rating: 2, publishedAt: "2026-07-01T00:00:00Z" }),
    review({ text: "", rating: 4, publishedAt: "2026-06-01T00:00:00Z" }),
  ];
  const insights = analyzeReviews(reviews);

  it("件数と平均評価を出す", () => {
    expect(insights.total).toBe(5);
    expect(insights.withText).toBe(4);
    expect(insights.averageRating).toBe(3.8);
    expect(insights.byStar.find((s) => s.star === 5)?.count).toBe(2);
  });

  it("よく出る語は「含む口コミの件数」で数え、その平均評価も出す", () => {
    const cut = insights.topics.find((t) => t.word === "カット");
    expect(cut?.count).toBe(2);
    expect(cut?.averageRating).toBe(4);
    // 1 件しか出てこない語は既定では落とす
    expect(insights.topics.map((t) => t.word)).not.toContain("縮毛矯正");
  });

  it("褒め言葉と不満のサインを数える", () => {
    expect(insights.positives.find((p) => p.word === "丁寧")?.count).toBe(3);
    expect(insights.negatives.map((n) => n.word)).toEqual(expect.arrayContaining(["待ち時間", "予約が取れ"]));
  });

  it("低評価の実例と、集めた期間を返す", () => {
    expect(insights.lowSamples).toHaveLength(1);
    expect(insights.lowSamples[0].text).toContain("予約が取れない");
    expect(insights.since).toBe("2026-06-01T00:00:00Z");
    expect(insights.until).toBe("2026-09-01T00:00:00Z");
  });

  it("口コミが無ければ空の結果", () => {
    const empty = analyzeReviews([]);
    expect(empty.total).toBe(0);
    expect(empty.averageRating).toBeNull();
    expect(empty.topics).toHaveLength(0);
    expect(empty.since).toBeNull();
  });
});
