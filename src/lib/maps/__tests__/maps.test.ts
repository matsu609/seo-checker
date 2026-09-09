/**
 * Google マップ（Places API）の応答の読み取りと、プロフィール充実度の採点のテスト。
 *
 * 応答は項目が欠けることが前提なので、「無い項目で落ちない」「無いものを 0 と
 * 混同しない」「取れない項目（オーナー権限が要る）は採点から外す」を中心に見る。
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/place.json";
import { parseDetailResponse, parseSearchResponse, toBusinessStatus } from "../parse";
import {
  CATEGORY_ORDER,
  hoursLookComplete,
  latestReviewAgeDays,
  looksKeywordStuffed,
  scoreProfile,
  type ProfileCheck,
} from "../score";
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

function statusById(checks: readonly ProfileCheck[]): Record<string, ProfileCheck["status"]> {
  return Object.fromEntries(checks.map((c) => [c.id, c.status]));
}

describe("充実度の採点", () => {
  it("フィクスチャは測定できた項目がすべて合格で 100 点", () => {
    const d = parseDetailResponse(fixture)!;
    const s = scoreProfile(d, NOW);
    expect(s.score).toBe(100);
    expect(s.grade?.grade).toBe("A");
    expect(s.checks.filter((c) => c.status !== "unavailable").every((c) => c.status === "pass")).toBe(true);
  });

  it("重みの合計は 100、カテゴリは 4 つで順番どおり", () => {
    const s = scoreProfile(empty(), NOW);
    expect(s.totalWeight).toBe(100);
    expect(s.categories.map((c) => c.id)).toEqual([...CATEGORY_ORDER]);
    expect(s.categories.map((c) => c.total)).toEqual([11, 2, 3, 5]);
  });

  it("オーナー権限が要る項目は unavailable で、採点の分母に入らない", () => {
    const s = scoreProfile(parseDetailResponse(fixture)!, NOW);
    const unavailable = s.checks.filter((c) => c.status === "unavailable");
    expect(unavailable.every((c) => c.source === "profile")).toBe(true);
    expect(unavailable.map((c) => c.id)).toEqual([
      "description",
      "openingDate",
      "menu",
      "postFrequency",
      "postKeywords",
      "photoFreshness",
      "logoCover",
      "reviewReply",
      "replyRate",
    ]);
    // 投稿は全項目が未取得なので、カテゴリのスコアは null（0 ではない）
    const posts = s.categories.find((c) => c.id === "posts")!;
    expect(posts.score).toBeNull();
    expect(posts.grade).toBeNull();
    expect(posts.measured).toBe(0);
    // 測定できた重み = 100 から未取得の重みを引いたもの
    expect(s.measuredWeight).toBe(100 - unavailable.reduce((a, c) => a + c.weight, 0));
  });

  it("何も無いプロフィールは低い。取得できなかった項目は fail ではなく warn", () => {
    const s = scoreProfile(empty(), NOW);
    const by = statusById(s.checks);
    expect(by.phone).toBe("fail");
    expect(by.hours).toBe("fail");
    expect(by.photos).toBe("fail");
    expect(by.website).toBe("fail");
    // 評価・件数・ステータスが「取れない」のは、無いと断定できないので warn
    expect(by.rating).toBe("warn");
    expect(by.reviewCount).toBe("warn");
    expect(by.status).toBe("warn");
    expect(s.score).not.toBeNull();
    expect(s.score!).toBeLessThan(40);
  });

  it("口コミ件数と評価のしきい値", () => {
    const at = (ratingCount: number, rating: number) => statusById(scoreProfile(empty({ ratingCount, rating }), NOW).checks);
    expect(at(100, 4.4)).toMatchObject({ reviewCount: "pass", rating: "pass" });
    expect(at(30, 4.0)).toMatchObject({ reviewCount: "warn", rating: "warn" });
    expect(at(29, 3.9)).toMatchObject({ reviewCount: "fail", rating: "fail" });
  });

  it("最新の口コミの古さ", () => {
    const review = (publishedAt: string) => ({ rating: 5, text: "", author: null, publishedAt, relative: null });
    expect(latestReviewAgeDays(empty({ reviews: [review("2026-09-01T00:00:00Z")] }), NOW)).toBe(9);
    expect(latestReviewAgeDays(empty({ reviews: [review("bad-date")] }), NOW)).toBeNull();
    expect(latestReviewAgeDays(empty(), NOW)).toBeNull();

    const status = (publishedAt: string) => statusById(scoreProfile(empty({ reviews: [review(publishedAt)] }), NOW).checks).recent;
    expect(status("2026-08-01T00:00:00Z")).toBe("pass");
    expect(status("2026-01-01T00:00:00Z")).toBe("warn");
    expect(status("2024-01-01T00:00:00Z")).toBe("fail");
  });

  it("閉業・臨時休業は fail", () => {
    expect(statusById(scoreProfile(empty({ status: "CLOSED_PERMANENTLY" }), NOW).checks).status).toBe("fail");
    expect(statusById(scoreProfile(empty({ status: "CLOSED_TEMPORARILY" }), NOW).checks).status).toBe("fail");
    expect(statusById(scoreProfile(empty({ status: "OPERATIONAL" }), NOW).checks).status).toBe("pass");
  });

  it("ビジネス名のキーワード詰め込み", () => {
    expect(looksKeywordStuffed("サンプル美容室 渋谷店")).toBe(false);
    expect(looksKeywordStuffed("サンプル美容室｜渋谷 格安 カット カラー 縮毛矯正 口コミ1位")).toBe(true);
    expect(looksKeywordStuffed("【渋谷駅3分】サンプル美容室")).toBe(true);
    expect(statusById(scoreProfile(empty({ name: "A店 | 渋谷 格安" }), NOW).checks).name).toBe("warn");
  });

  it("営業時間の揃い具合", () => {
    expect(hoursLookComplete([])).toBe("none");
    expect(hoursLookComplete(["月曜日: 10時〜19時"])).toBe("partial");
    const week = ["月", "火", "水", "木", "金", "土", "日"].map((d) => `${d}曜日: 10時00分～19時00分`);
    expect(hoursLookComplete(week)).toBe("complete");
    expect(hoursLookComplete(week.map((h) => h.replace(/10時.*$/, "定休日")))).toBe("partial");
    const by = statusById(scoreProfile(empty({ hours: week.slice(0, 5) }), NOW).checks);
    expect(by.hours).toBe("pass");
    expect(by.hoursAccuracy).toBe("warn");
  });
});
