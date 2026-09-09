/**
 * Google マップ（Places API）の応答の読み取りと、プロフィール充実度の採点のテスト。
 *
 * 応答は項目が欠けることが前提なので、「無い項目で落ちない」「無いものを 0 と
 * 混同しない」を中心に見る。
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/place.json";
import { parseDetailResponse, parseSearchResponse, toBusinessStatus } from "../parse";
import { latestReviewAgeDays, scoreProfile } from "../score";
import type { PlaceDetail } from "../types";

const NOW = new Date("2026-09-10T00:00:00Z");

describe("応答の読み取り", () => {
  it("詳細を PlaceDetail にする", () => {
    const d = parseDetailResponse(fixture);
    expect(d).not.toBeNull();
    expect(d!.name).toBe("サンプル美容室 渋谷店");
    expect(d!.category).toBe("美容院");
    expect(d!.rating).toBe(4.6);
    expect(d!.ratingCount).toBe(128);
    expect(d!.phone).toBe("03-1234-5678");
    expect(d!.website).toBe("https://example.com/");
    expect(d!.hours).toHaveLength(7);
    expect(d!.photoCount).toBe(10);
    expect(d!.reviews).toHaveLength(2);
    expect(d!.description).toBe("落ち着いた雰囲気のヘアサロン。");
    expect(d!.status).toBe("OPERATIONAL");
  });

  it("翻訳文が無い口コミは原文を使う", () => {
    const d = parseDetailResponse(fixture)!;
    expect(d.reviews[1].text).toBe("Good service, a bit pricey.");
    expect(d.reviews[1].author).toBe("J. Smith");
  });

  it("項目が欠けていても落ちず、無いものは null / 空にする", () => {
    const d = parseDetailResponse({ id: "x" });
    expect(d).not.toBeNull();
    expect(d!.name).toBe("（名称不明）");
    expect(d!.rating).toBeNull();
    expect(d!.ratingCount).toBeNull();
    expect(d!.phone).toBeNull();
    expect(d!.hours).toEqual([]);
    expect(d!.photoCount).toBe(0);
    expect(d!.reviews).toEqual([]);
    expect(d!.status).toBe("UNKNOWN");
  });

  it("id が無い応答は null", () => {
    expect(parseDetailResponse({ displayName: { text: "a" } })).toBeNull();
    expect(parseDetailResponse(null)).toBeNull();
  });

  it("検索結果は壊れた要素だけ捨てる", () => {
    const list = parseSearchResponse({
      places: [fixture, { displayName: { text: "id なし" } }, { id: "ok", displayName: { text: "B" } }],
    });
    expect(list.map((p) => p.id)).toEqual(["ChIJN1t_tDeuEmsRUsoyG83frY4", "ok"]);
    expect(parseSearchResponse({})).toEqual([]);
    expect(parseSearchResponse("x")).toEqual([]);
  });

  it("営業ステータスは知らない値を UNKNOWN にする", () => {
    expect(toBusinessStatus("OPERATIONAL")).toBe("OPERATIONAL");
    expect(toBusinessStatus("CLOSED_PERMANENTLY")).toBe("CLOSED_PERMANENTLY");
    expect(toBusinessStatus("something")).toBe("UNKNOWN");
    expect(toBusinessStatus(undefined)).toBe("UNKNOWN");
  });
});

function empty(patch: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    id: "x",
    name: "店",
    address: null,
    rating: null,
    ratingCount: null,
    category: null,
    status: "UNKNOWN",
    phone: null,
    website: null,
    hours: [],
    photoCount: 0,
    reviews: [],
    description: null,
    mapsUrl: null,
    types: [],
    ...patch,
  };
}

describe("充実度の採点", () => {
  it("フィクスチャは満点", () => {
    const d = parseDetailResponse(fixture)!;
    const s = scoreProfile(d, NOW);
    expect(s.score).toBe(100);
    expect(s.checks.every((c) => c.status === "pass")).toBe(true);
  });

  it("重みの合計は 100", () => {
    const s = scoreProfile(empty(), NOW);
    expect(s.checks.reduce((a, c) => a + c.weight, 0)).toBe(100);
  });

  it("何も無いプロフィールは低い。取得できなかった項目は fail ではなく warn", () => {
    const s = scoreProfile(empty(), NOW);
    const by = Object.fromEntries(s.checks.map((c) => [c.id, c.status]));
    expect(by.phone).toBe("fail");
    expect(by.hours).toBe("fail");
    expect(by.photos).toBe("fail");
    // 評価・件数・ステータスが「取れない」のは、無いと断定できないので warn
    expect(by.rating).toBe("warn");
    expect(by.reviews).toBe("warn");
    expect(by.status).toBe("warn");
    expect(s.score).toBeLessThan(30);
  });

  it("口コミ件数と評価のしきい値", () => {
    const at = (ratingCount: number, rating: number) =>
      Object.fromEntries(scoreProfile(empty({ ratingCount, rating }), NOW).checks.map((c) => [c.id, c.status]));
    expect(at(30, 4.3)).toMatchObject({ reviews: "pass", rating: "pass" });
    expect(at(10, 4.0)).toMatchObject({ reviews: "warn", rating: "warn" });
    expect(at(9, 3.9)).toMatchObject({ reviews: "fail", rating: "fail" });
  });

  it("最新の口コミの古さ", () => {
    const review = (publishedAt: string) => ({ rating: 5, text: "", author: null, publishedAt, relative: null });
    expect(latestReviewAgeDays(empty({ reviews: [review("2026-09-01T00:00:00Z")] }), NOW)).toBe(9);
    expect(latestReviewAgeDays(empty({ reviews: [review("bad-date")] }), NOW)).toBeNull();
    expect(latestReviewAgeDays(empty(), NOW)).toBeNull();

    const status = (publishedAt: string) =>
      scoreProfile(empty({ reviews: [review(publishedAt)] }), NOW).checks.find((c) => c.id === "recent")!.status;
    expect(status("2026-08-01T00:00:00Z")).toBe("pass");
    expect(status("2026-01-01T00:00:00Z")).toBe("warn");
    expect(status("2024-01-01T00:00:00Z")).toBe("fail");
  });

  it("閉業は fail、臨時休業も fail", () => {
    expect(scoreProfile(empty({ status: "CLOSED_PERMANENTLY" }), NOW).checks[0].status).toBe("fail");
    expect(scoreProfile(empty({ status: "CLOSED_TEMPORARILY" }), NOW).checks[0].status).toBe("fail");
    expect(scoreProfile(empty({ status: "OPERATIONAL" }), NOW).checks[0].status).toBe("pass");
  });
});
