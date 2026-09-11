/**
 * Google マップ（Places API）の応答の読み取りと、プロフィール充実度の採点のテスト。
 *
 * 応答は項目が欠けることが前提なので、「無い項目で落ちない」「無いものを 0 と
 * 混同しない」「取れない項目（オーナー権限が要る）は採点から外す」を中心に見る。
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/place.json";
import { parseDetailResponse, parseSearchResponse, toBusinessStatus, toPrice } from "../parse";
import {
  CATEGORY_ORDER,
  hoursLookComplete,
  latestReviewAgeDays,
  looksKeywordStuffed,
  scoreProfile,
  WEIGHTS,
  type ProfileCheck,
} from "../score";
import { emptyOwnerInput, type MeoOwnerData } from "../owner-input";
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

  it("r28 で足した項目（追加カテゴリ・住所要素・属性・写真・リンク・価格・警告）を読む", () => {
    const d = parseDetailResponse(fixture)!;
    expect(d.primaryType).toBe("hair_salon");
    expect(d.extraTypes).toEqual(["beauty_salon"]);
    expect(d.hasBuilding).toBe(true);
    expect(d.location).toEqual({ lat: 35.6595, lng: 139.7005 });
    expect(d.price).toBeNull();
    expect(d.attributes!.map((a) => `${a.label}=${a.value}`)).toEqual([
      "車いす対応の入口=true",
      "車いす対応のトイレ=false",
      "クレジットカード=true",
      "現金のみ=false",
      "タッチ決済（NFC）=true",
      "予約可=true",
    ]);
    expect(d.photos).toHaveLength(10);
    expect(d.photos!.filter((ph) => ph.author === d.name)).toHaveLength(3);
    expect(d.photos![0]).toEqual({ widthPx: 4032, heightPx: 3024, author: "サンプル美容室 渋谷店" });
    expect(d.links?.writeReview).toContain("action=review");
    expect(d.aiSummary).toBeNull();
    expect(d.serviceArea).toBe(false);
    expect(d.consumerAlert).toBeNull();
  });

  it("価格帯: 範囲があればそれ、無ければレベル", () => {
    expect(toPrice({ priceLevel: "PRICE_LEVEL_MODERATE" })).toBe("¥¥（普通）");
    expect(toPrice({ priceRange: { startPrice: { currencyCode: "JPY", units: "1000" }, endPrice: { currencyCode: "JPY", units: 2000 } } })).toBe("¥1,000〜¥2,000");
    expect(toPrice({ priceRange: { startPrice: { currencyCode: "JPY", units: "5000" } } })).toBe("¥5,000〜");
    expect(toPrice({})).toBeNull();
    expect(toPrice({ priceLevel: "PRICE_LEVEL_UNSPECIFIED" })).toBeNull();
  });

  it("r28 の項目が欠けていても落ちず、無いものは null / 空", () => {
    const d = parseDetailResponse({ id: "x" })!;
    expect(d.extraTypes).toEqual([]);
    expect(d.hasBuilding).toBeNull();
    expect(d.location).toBeNull();
    expect(d.attributes).toEqual([]);
    expect(d.photos).toEqual([]);
    expect(d.links).toBeNull();
    expect(d.consumerAlert).toBeNull();
    // 警告があれば文字列
    expect(parseDetailResponse({ id: "x", consumerAlert: { overview: "不審な口コミ" } })!.consumerAlert).toBe("不審な口コミ");
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
  it("フィクスチャは測定できた項目がすべて合格で 100 点（無料 21 項目・有料 28 項目とも）", () => {
    const d = parseDetailResponse(fixture)!;
    for (const extended of [false, true]) {
      const s = scoreProfile(d, NOW, null, { extended });
      expect(s.extended).toBe(extended);
      expect(s.score).toBe(100);
      expect(s.grade?.grade).toBe("A");
      expect(s.checks.filter((c) => c.status !== "unavailable").every((c) => c.status === "pass")).toBe(true);
    }
  });

  it("重みの合計は 100、カテゴリは 4 つで順番どおり（無料 21 項目 / 有料 28 項目）", () => {
    const base = scoreProfile(empty(), NOW, null, { extended: false });
    expect(base.totalWeight).toBe(100);
    expect(base.categories.map((c) => c.id)).toEqual([...CATEGORY_ORDER]);
    expect(base.categories.map((c) => c.total)).toEqual([11, 2, 3, 5]);
    const ext = scoreProfile(empty(), NOW);
    expect(ext.totalWeight).toBe(100);
    expect(ext.categories.map((c) => c.total)).toEqual([13, 2, 5, 8]);
    expect(ext.checks).toHaveLength(28);
    // 表の合計もそれぞれ 100
    expect(Object.values(WEIGHTS.base).reduce((a, b) => a + b, 0)).toBe(100);
    expect(Object.values(WEIGHTS.extended).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("オーナー権限が要る項目は unavailable で、採点の分母に入らない", () => {
    const s = scoreProfile(parseDetailResponse(fixture)!, NOW, null, { extended: false });
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

/* ───────────── オーナー申告での採点 ───────────── */

function owner(partial: Partial<MeoOwnerData["input"]>, updatedAt = "2026-09-09T00:00:00Z"): MeoOwnerData {
  return { input: { ...emptyOwnerInput(), ...partial }, updatedAt };
}

const GOOD_OWNER = owner({
  keywords: ["渋谷", "美容室"],
  description: "渋谷駅から徒歩 3 分の美容室です。".repeat(15),
  openingDate: true,
  menu: true,
  postsLast4Weeks: 4,
  latestPostText: "渋谷の美容室から秋のキャンペーンのお知らせです",
  ownerPhotoLastAt: "2026-09-01",
  logo: true,
  cover: true,
  repliedReviews: 128,
  replyText: "この度は当店（フィクスチャの店）をご利用いただきありがとうございました。渋谷でお待ちしています",
});

describe("オーナー申告での採点", () => {
  it("全部答えると 21 項目すべて測定され、良い申告なら 100 点", () => {
    const d = parseDetailResponse(fixture)!;
    const s = scoreProfile(d, NOW, GOOD_OWNER);
    expect(s.checks.some((c) => c.status === "unavailable")).toBe(false);
    expect(s.measuredWeight).toBe(100);
    expect(s.score).toBe(100);
    expect(s.checks.filter((c) => c.source === "owner")).toHaveLength(9);
    expect(s.categories.map((c) => `${c.measured}/${c.total}`)).toEqual(["13/13", "2/2", "5/5", "8/8"]);
  });

  it("答えた項目だけが採点に入る（未回答は unavailable のまま）", () => {
    const d = parseDetailResponse(fixture)!;
    const s = scoreProfile(d, NOW, owner({ openingDate: false, menu: true }));
    const by = statusById(s.checks);
    expect(by.openingDate).toBe("fail");
    expect(by.menu).toBe("pass");
    expect(by.description).toBe("unavailable");
    expect(by.postFrequency).toBe("unavailable");
    expect(s.checks.filter((c) => c.status === "unavailable")).toHaveLength(7);
  });

  it("申告なし（null / 未指定）は従来どおり 9 項目が unavailable", () => {
    const d = parseDetailResponse(fixture)!;
    expect(scoreProfile(d, NOW, null).checks.filter((c) => c.status === "unavailable")).toHaveLength(9);
    expect(scoreProfile(d, NOW, owner({})).checks.filter((c) => c.status === "unavailable")).toHaveLength(9);
  });

  it("全部答えると 21 項目すべて測定され、良い申告なら 100 点（無料 21 項目版）", () => {
    const d = parseDetailResponse(fixture)!;
    const s = scoreProfile(d, NOW, GOOD_OWNER, { extended: false });
    expect(s.checks).toHaveLength(21);
    expect(s.score).toBe(100);
  });

  it("説明文: 未設定は fail、短い / URL 入り / キーワード無しは warn、十分なら pass", () => {
    const d = parseDetailResponse(fixture)!;
    const run = (partial: Partial<MeoOwnerData["input"]>) => statusById(scoreProfile(d, NOW, owner(partial)).checks).description;
    expect(run({ description: "" })).toBe("fail");
    expect(run({ description: "短い説明" })).toBe("warn");
    expect(run({ description: `${"渋谷の美容室です。".repeat(30)} https://example.com` })).toBe("warn");
    expect(run({ description: "新宿の美容室です。".repeat(30), keywords: ["渋谷"] })).toBe("warn");
    expect(run({ description: "渋谷の美容室です。".repeat(30), keywords: ["渋谷"] })).toBe("pass");
    expect(run({ description: "新宿の美容室です。".repeat(30) })).toBe("pass");
  });

  it("投稿: 4 週間に 4 件以上で pass、1〜3 件 warn、0 件 fail（キーワードも fail）", () => {
    const d = parseDetailResponse(fixture)!;
    const run = (partial: Partial<MeoOwnerData["input"]>) => statusById(scoreProfile(d, NOW, owner(partial)).checks);
    expect(run({ postsLast4Weeks: 4 }).postFrequency).toBe("pass");
    expect(run({ postsLast4Weeks: 2 }).postFrequency).toBe("warn");
    const none = run({ postsLast4Weeks: 0 });
    expect(none.postFrequency).toBe("fail");
    expect(none.postKeywords).toBe("fail");
    // 投稿はあるが本文は未回答 → キーワードは unavailable
    expect(run({ postsLast4Weeks: 4 }).postKeywords).toBe("unavailable");
    expect(run({ postsLast4Weeks: 4, latestPostText: "渋谷でイベント", keywords: ["渋谷"] }).postKeywords).toBe("pass");
    expect(run({ postsLast4Weeks: 4, latestPostText: "イベント", keywords: ["渋谷"] }).postKeywords).toBe("fail");
    // キーワード未設定なら判定できないので warn
    expect(run({ postsLast4Weeks: 4, latestPostText: "イベント" }).postKeywords).toBe("warn");
  });

  it("写真: オーナー写真が 31 日以内 pass、90 日以内 warn、それ以上 fail。ロゴとカバーは両方で pass", () => {
    const d = parseDetailResponse(fixture)!;
    const run = (partial: Partial<MeoOwnerData["input"]>) => statusById(scoreProfile(d, NOW, owner(partial)).checks);
    expect(run({ ownerPhotoLastAt: "2026-08-20" }).photoFreshness).toBe("pass");
    expect(run({ ownerPhotoLastAt: "2026-07-01" }).photoFreshness).toBe("warn");
    expect(run({ ownerPhotoLastAt: "2026-01-01" }).photoFreshness).toBe("fail");
    expect(run({ logo: true, cover: true }).logoCover).toBe("pass");
    expect(run({ logo: true, cover: null }).logoCover).toBe("warn");
    expect(run({ logo: false, cover: false }).logoCover).toBe("fail");
  });

  it("返信率: 口コミ 128 件に対して 90% 以上 pass、50% 以上 warn、未満 fail。返信文は店名かキーワードで pass", () => {
    const d = parseDetailResponse(fixture)!;
    const run = (partial: Partial<MeoOwnerData["input"]>) => statusById(scoreProfile(d, NOW, owner(partial)).checks);
    expect(run({ repliedReviews: 120 }).replyRate).toBe("pass");
    expect(run({ repliedReviews: 70 }).replyRate).toBe("warn");
    expect(run({ repliedReviews: 10 }).replyRate).toBe("fail");
    const none = run({ repliedReviews: 0 });
    expect(none.replyRate).toBe("fail");
    expect(none.reviewReply).toBe("fail");
    expect(run({ repliedReviews: 120 }).reviewReply).toBe("unavailable");
    expect(run({ repliedReviews: 120, replyText: `${d.name} をご利用いただきありがとうございます` }).reviewReply).toBe("pass");
    expect(run({ repliedReviews: 120, replyText: "渋谷でお待ちしています", keywords: ["渋谷"] }).reviewReply).toBe("pass");
    expect(run({ repliedReviews: 120, replyText: "ありがとうございました" }).reviewReply).toBe("fail");
    // 口コミ件数が取れない店舗では返信率を出せない → warn
    const noCount = scoreProfile({ ...d, ratingCount: null }, NOW, owner({ repliedReviews: 5 }));
    expect(statusById(noCount.checks).replyRate).toBe("warn");
  });
});

/* ───────────── r28: Google から取れる 7 項目 ───────────── */

describe("Google 取得の追加 7 項目（有料のみ）", () => {
  const d = parseDetailResponse(fixture)!;
  const run = (patch: Partial<PlaceDetail>, o: MeoOwnerData | null = null) => statusById(scoreProfile({ ...d, ...patch }, NOW, o).checks);

  it("無料 21 項目版には含まれない", () => {
    const ids = scoreProfile(d, NOW, null, { extended: false }).checks.map((c) => c.id);
    for (const id of ["extraCategories", "attributes", "ownerPhotos", "photoQuality", "reviewKeywords", "reviewText", "consumerAlert"]) {
      expect(ids).not.toContain(id);
    }
  });

  it("追加カテゴリ: 無ければ warn", () => {
    expect(run({}).extraCategories).toBe("pass");
    expect(run({ extraTypes: [] }).extraCategories).toBe("warn");
  });

  it("属性: 5 個以上 pass、1〜4 warn、0 fail", () => {
    expect(run({}).attributes).toBe("pass");
    expect(run({ attributes: d.attributes!.slice(0, 2) }).attributes).toBe("warn");
    expect(run({ attributes: [] }).attributes).toBe("fail");
  });

  it("オーナー投稿の写真: 3 枚以上 pass、1〜2 warn、0 fail。投稿者情報が無ければ unavailable", () => {
    expect(run({}).ownerPhotos).toBe("pass");
    const photos = d.photos!;
    expect(run({ photos: [photos[0], ...photos.slice(3)] }).ownerPhotos).toBe("warn");
    expect(run({ photos: photos.slice(3) }).ownerPhotos).toBe("fail");
    expect(run({ photos: photos.map((p) => ({ ...p, author: null })) }).ownerPhotos).toBe("unavailable");
    expect(run({ photos: [], photoCount: 0 }).ownerPhotos).toBe("fail");
    // 店名の空白違いは同じ投稿者とみなす
    expect(run({ photos: photos.map((p) => ({ ...p, author: "サンプル美容室渋谷店" })) }).ownerPhotos).toBe("pass");
  });

  it("写真の解像度: 長辺 1024px 未満があれば warn、大きさが無ければ unavailable", () => {
    expect(run({}).photoQuality).toBe("pass");
    const photos = d.photos!;
    expect(run({ photos: [{ ...photos[0], widthPx: 800, heightPx: 600 }, ...photos.slice(1)] }).photoQuality).toBe("warn");
    expect(run({ photos: photos.map((p) => ({ ...p, widthPx: null, heightPx: null })) }).photoQuality).toBe("unavailable");
  });

  it("口コミ内のキーワード: カテゴリか対策キーワードを含めば pass、含まなければ warn", () => {
    // フィクスチャの口コミにカテゴリ「美容院」が含まれる
    expect(run({}).reviewKeywords).toBe("pass");
    expect(run({ category: "理容室" }).reviewKeywords).toBe("warn");
    expect(run({ category: "理容室" }, owner({ keywords: ["カウンセリング"] })).reviewKeywords).toBe("pass");
    // 判定に使う語が無ければ warn
    expect(run({ category: null }, null).reviewKeywords).toBe("warn");
    expect(run({ reviews: [] }).reviewKeywords).toBe("unavailable");
  });

  it("口コミ本文: 20 文字以上が 60% 以上で pass", () => {
    expect(run({}).reviewText).toBe("pass");
    const short = d.reviews.map((r) => ({ ...r, text: "良い" }));
    expect(run({ reviews: short }).reviewText).toBe("warn");
    expect(run({ reviews: [] }).reviewText).toBe("unavailable");
  });

  it("Google の警告: 無ければ pass、あれば fail", () => {
    expect(run({}).consumerAlert).toBe("pass");
    expect(run({ consumerAlert: "不審な口コミ活動が検出されました" }).consumerAlert).toBe("fail");
  });

  it("r28 より前に保存した詳細（項目が undefined）では、追加項目は unavailable で採点を止めない", () => {
    const legacy = { ...d } as Record<string, unknown>;
    for (const k of ["extraTypes", "attributes", "photos", "consumerAlert", "hasBuilding", "links"]) delete legacy[k];
    const s = scoreProfile(legacy as unknown as PlaceDetail, NOW);
    const by = statusById(s.checks);
    expect(by.extraCategories).toBe("unavailable");
    expect(by.attributes).toBe("unavailable");
    expect(by.ownerPhotos).toBe("unavailable");
    expect(by.consumerAlert).toBe("unavailable");
    expect(by.reviewText).toBe("pass");
    expect(s.score).not.toBeNull();
  });
});
