/**
 * Business Profile API クライアント: 応答の解析（純関数）と、呼び出しの形（URL・メソッド・本文・エラー）。
 */
import { describe, expect, it, vi } from "vitest";
import { LOCAL_POSTS_PAGE_SIZE, LOCAL_POST_SUMMARY_MAX } from "@/lib/posts/constants";
import {
  createLocalPost,
  deleteLocalPost,
  deleteReply,
  isLocalPostName,
  isLocationName,
  isReviewName,
  listAllLocations,
  listLocalPosts,
  listReviews,
  parseLocalPost,
  parseLocalPosts,
  parseAccounts,
  parseLocations,
  parseReviews,
  replyToReview,
  starToNumber,
  toInformationName,
  toLocalPostBody,
  toLocationPatch,
  toTimeOfDay,
  updateLocationNap,
} from "../business-profile";
import { GoogleLinkError } from "../errors";
import { BUSINESS_PROFILE_SCOPE, canUse, missingScopes } from "../scopes";

const REVIEW = {
  name: "accounts/1/locations/2/reviews/abc",
  reviewId: "abc",
  reviewer: { displayName: "山田", isAnonymous: false },
  starRating: "TWO",
  comment: "提供が遅かった",
  createTime: "2026-09-01T00:00:00Z",
  updateTime: "2026-09-02T00:00:00Z",
  reviewReply: { comment: "申し訳ありません", updateTime: "2026-09-03T00:00:00Z" },
};

describe("スコープ", () => {
  it("business.manage は口コミ返信にだけ要り、設定画面の必須には入らない", () => {
    expect(canUse([BUSINESS_PROFILE_SCOPE], "business-profile")).toBe(true);
    expect(canUse(["email"], "business-profile")).toBe(false);
    expect(missingScopes([BUSINESS_PROFILE_SCOPE])).toHaveLength(0);
  });
});

describe("応答の解析", () => {
  it("星の文字列 → 数", () => {
    expect(starToNumber("FIVE")).toBe(5);
    expect(starToNumber("ONE")).toBe(1);
    expect(starToNumber("SIX")).toBeNull();
    expect(starToNumber(5)).toBeNull();
  });

  it("アカウントとビジネス（name は accounts/…/locations/… に揃える）", () => {
    expect(parseAccounts({ accounts: [{ name: "accounts/1", accountName: "〇〇食堂", type: "PERSONAL" }, { name: "bad" }] })).toEqual([{ name: "accounts/1", accountName: "〇〇食堂", type: "PERSONAL" }]);
    const locs = parseLocations(
      {
        locations: [
          { name: "locations/2", title: "本店", storefrontAddress: { administrativeArea: "東京都", locality: "新宿区", addressLines: ["歌舞伎町 1-1"] }, metadata: { placeId: "ChIJx" } },
          { name: "locations/3", title: "駅前店" },
          { name: "nope" },
        ],
      },
      "accounts/1",
    );
    expect([...locs].sort((a, b) => a.name.localeCompare(b.name))).toEqual([
      { name: "accounts/1/locations/2", title: "本店", address: "東京都 新宿区 歌舞伎町 1-1", placeId: "ChIJx", accountName: "accounts/1" },
      { name: "accounts/1/locations/3", title: "駅前店", address: "", placeId: null, accountName: "accounts/1" },
    ]);
  });

  it("口コミ（返信の有無・匿名・不正な行は捨てる）", () => {
    const page = parseReviews({ reviews: [REVIEW, { ...REVIEW, name: "x" }, { ...REVIEW, name: "accounts/1/locations/2/reviews/def", reviewer: { isAnonymous: true }, reviewReply: undefined, starRating: "FIVE", comment: "" }], nextPageToken: "tok", averageRating: 4.2, totalReviewCount: 120 });
    expect(page.nextPageToken).toBe("tok");
    expect(page.averageRating).toBe(4.2);
    expect(page.totalReviewCount).toBe(120);
    expect(page.reviews).toHaveLength(2);
    expect(page.reviews[0]).toMatchObject({ reviewer: "山田", anonymous: false, rating: 2, reply: { comment: "申し訳ありません" } });
    expect(page.reviews[1]).toMatchObject({ reviewer: "Google ユーザー", anonymous: true, rating: 5, comment: "", reply: null });
    expect(parseReviews(null)).toEqual({ reviews: [], nextPageToken: null, averageRating: null, totalReviewCount: null });
  });

  it("名前の形", () => {
    expect(isLocationName("accounts/1/locations/2")).toBe(true);
    expect(isLocationName("locations/2")).toBe(false);
    expect(isReviewName("accounts/1/locations/2/reviews/abc")).toBe(true);
    expect(isReviewName("accounts/1/locations/2/reviews/../x")).toBe(false);
  });
});

describe("呼び出し", () => {
  const getToken = async () => "tok";

  it("ビジネス一覧はアカウントごとに取り、口コミは 50 件ずつ新しい順", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/accounts?")) return Response.json({ accounts: [{ name: "accounts/1", accountName: "A" }] });
      if (url.includes("/locations?")) return Response.json({ locations: [{ name: "locations/2", title: "本店" }] });
      return Response.json({ reviews: [REVIEW] });
    }) as unknown as typeof fetch;
    const locs = await listAllLocations({ fetchImpl, getToken });
    expect(locs.map((l) => l.name)).toEqual(["accounts/1/locations/2"]);
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[1]![0]).toContain("/accounts/1/locations?readMask=");
    const page = await listReviews("accounts/1/locations/2", "next", { fetchImpl, getToken });
    expect(page.reviews).toHaveLength(1);
    const last = calls[calls.length - 1]!;
    expect(last[0]).toContain("/accounts/1/locations/2/reviews?pageSize=50&orderBy=updateTime+desc&pageToken=next");
    expect((last[1] as RequestInit).headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("返信は PUT …/reply に { comment }、削除は DELETE", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ comment: "ありがとうございます", updateTime: "2026-09-11T00:00:00Z" }))) as unknown as typeof fetch;
    const reply = await replyToReview("accounts/1/locations/2/reviews/abc", "ありがとうございます", { fetchImpl, getToken });
    expect(reply).toEqual({ comment: "ありがとうございます", updatedAt: "2026-09-11T00:00:00Z" });
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toBe("https://mybusiness.googleapis.com/v4/accounts/1/locations/2/reviews/abc/reply");
    expect((calls[0]![1] as RequestInit).method).toBe("PUT");
    expect(JSON.parse((calls[0]![1] as RequestInit).body as string)).toEqual({ comment: "ありがとうございます" });
    await deleteReply("accounts/1/locations/2/reviews/abc", { fetchImpl, getToken });
    expect((calls[1]![1] as RequestInit).method).toBe("DELETE");
    await expect(replyToReview("bad", "x", { fetchImpl, getToken })).rejects.toBeInstanceOf(GoogleLinkError);
  });

  it("403 は「API の承認・有効化」を案内する", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    await expect(listReviews("accounts/1/locations/2", null, { fetchImpl, getToken })).rejects.toMatchObject({ code: "forbidden", message: expect.stringContaining("利用申請") });
  });
});

describe("toTimeOfDay", () => {
  it("HH:MM を数値に分ける", () => {
    expect(toTimeOfDay("10:30")).toEqual({ hours: 10, minutes: 30 });
    expect(toTimeOfDay(" 9:05 ")).toEqual({ hours: 9, minutes: 5 });
  });

  it("読めない値は null", () => {
    expect(toTimeOfDay("25:00")).toBeNull();
    expect(toTimeOfDay("10:99")).toBeNull();
    expect(toTimeOfDay("10時")).toBeNull();
  });
});

describe("toLocationPatch", () => {
  const nap = {
    title: "テスト商会",
    phone: "03-1234-5678",
    website: "https://example.com",
    description: "説明",
    hours: [{ dayOfWeek: "Monday", opens: "10:00", closes: "19:00" }],
  };

  it("送る項目だけを updateMask に入れる", () => {
    const { body, updateMask } = toLocationPatch(nap);
    expect(updateMask).toBe("title,phoneNumbers,websiteUri,profile,regularHours");
    expect(body.title).toBe("テスト商会");
    expect(body.phoneNumbers).toEqual({ primaryPhone: "03-1234-5678" });
    expect(body.regularHours).toEqual({
      periods: [{ openDay: "MONDAY", openTime: { hours: 10, minutes: 0 }, closeDay: "MONDAY", closeTime: { hours: 19, minutes: 0 } }],
    });
  });

  it("住所は決して送らない（再審査になるため）", () => {
    expect(Object.keys(toLocationPatch(nap).body)).not.toContain("storefrontAddress");
  });

  it("空の項目は消さない（マスクに入れない）", () => {
    const { body, updateMask } = toLocationPatch({ title: "", phone: " ", website: "", description: "", hours: [] });
    expect(updateMask).toBe("");
    expect(body).toEqual({});
  });

  it("読めない営業時間は落とす", () => {
    const { updateMask } = toLocationPatch({ ...nap, hours: [{ dayOfWeek: "Funday", opens: "10:00", closes: "19:00" }] });
    expect(updateMask).not.toContain("regularHours");
  });
});

describe("toInformationName", () => {
  it("accounts/… を locations/… に直す（Business Information v1 の形）", () => {
    expect(toInformationName("accounts/123/locations/456")).toBe("locations/456");
  });
});

describe("updateLocationNap", () => {
  it("送るものが無ければ呼び出さない", async () => {
    const fetchImpl = vi.fn();
    const sent = await updateLocationNap(
      "accounts/1/locations/2",
      { title: "", phone: "", website: "", description: "", hours: [] },
      { fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => "t" },
    );
    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("PATCH を updateMask つきで送る", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json({});
    });
    const sent = await updateLocationNap(
      "accounts/1/locations/2",
      { title: "テスト商会", phone: "", website: "", description: "", hours: [] },
      { fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => "t", informationEndpoint: "https://info.test/v1" },
    );
    expect(sent).toBe(true);
    expect(calls[0]?.url).toBe("https://info.test/v1/locations/2?updateMask=title");
    expect(calls[0]?.init?.method).toBe("PATCH");
  });

  it("ビジネスの指定が正しくなければ例外", async () => {
    await expect(
      updateLocationNap("locations/2", { title: "a", phone: "", website: "", description: "", hours: [] }, { getToken: async () => "t" }),
    ).rejects.toThrow(GoogleLinkError);
  });
});

describe("ビジネス プロフィールへの投稿（localPosts）", () => {
  const POST = {
    name: "accounts/1/locations/2/localPosts/abc",
    languageCode: "ja",
    summary: "秋の限定メニューを始めました。",
    state: "LIVE",
    topicType: "STANDARD",
    searchUrl: "https://search.google.com/local/posts?q=1",
    createTime: "2026-09-19T00:00:00Z",
    updateTime: "2026-09-19T01:00:00Z",
    callToAction: { actionType: "LEARN_MORE", url: "https://example.com/menu" },
  };

  it("投稿の名前の形を見分ける", () => {
    expect(isLocalPostName("accounts/1/locations/2/localPosts/abc")).toBe(true);
    expect(isLocalPostName("accounts/1/locations/2/reviews/abc")).toBe(false);
    expect(isLocalPostName("locations/2/localPosts/abc")).toBe(false);
  });

  it("応答を解析する。名前の形が違うものは落とす", () => {
    const page = parseLocalPosts({ localPosts: [POST, { name: "壊れた" }, null], nextPageToken: "next" });
    expect(page.posts).toHaveLength(1);
    expect(page.nextPageToken).toBe("next");
    expect(page.posts[0]).toEqual({
      name: POST.name,
      summary: POST.summary,
      state: "LIVE",
      topicType: "STANDARD",
      searchUrl: POST.searchUrl,
      createdAt: POST.createTime,
      updatedAt: POST.updateTime,
      cta: { actionType: "LEARN_MORE", url: "https://example.com/menu" },
    });
  });

  it("空の応答でも落ちない", () => {
    expect(parseLocalPosts(null)).toEqual({ posts: [], nextPageToken: null });
    expect(parseLocalPost({})).toBeNull();
  });

  it("本文を組み立てる: 最新情報として送り、空の項目は入れない", () => {
    expect(toLocalPostBody({ summary: "  お知らせ  ", cta: null, photoUrl: "" })).toEqual({
      languageCode: "ja",
      summary: "お知らせ",
      topicType: "STANDARD",
    });
  });

  it("ボタンと写真を付ける", () => {
    const body = toLocalPostBody({ summary: "お知らせ", cta: { actionType: "BOOK", url: "https://example.com/r" }, photoUrl: "https://example.com/p.jpg" });
    expect(body.callToAction).toEqual({ actionType: "BOOK", url: "https://example.com/r" });
    expect(body.media).toEqual([{ mediaFormat: "PHOTO", sourceUrl: "https://example.com/p.jpg" }]);
  });

  // CALL はビジネス プロフィールの電話番号を使う。URL を付けると Google が弾く
  it("今すぐ電話には URL を付けない", () => {
    expect(toLocalPostBody({ summary: "お知らせ", cta: { actionType: "CALL", url: "https://example.com" }, photoUrl: "" }).callToAction).toEqual({ actionType: "CALL" });
  });

  it("URL が空のボタンは付けない（Google が 400 を返すため）", () => {
    expect(toLocalPostBody({ summary: "お知らせ", cta: { actionType: "SHOP", url: "  " }, photoUrl: "" }).callToAction).toBeUndefined();
  });

  it("上限を超えた本文は切る", () => {
    const body = toLocalPostBody({ summary: "あ".repeat(LOCAL_POST_SUMMARY_MAX + 100), cta: null, photoUrl: "" });
    expect((body.summary as string).length).toBe(LOCAL_POST_SUMMARY_MAX);
  });

  it("v4 に POST する", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return Response.json(POST);
    });
    const post = await createLocalPost(
      "accounts/1/locations/2",
      { summary: "お知らせ", cta: null, photoUrl: "" },
      { fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => "t", reviewsEndpoint: "https://v4.test/v4" },
    );
    expect(calls[0]?.url).toBe("https://v4.test/v4/accounts/1/locations/2/localPosts");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(post?.name).toBe(POST.name);
  });

  it("本文が空なら呼び出さない", async () => {
    const fetchImpl = vi.fn();
    await expect(
      createLocalPost("accounts/1/locations/2", { summary: "  ", cta: null, photoUrl: "" }, { fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => "t" }),
    ).rejects.toThrow(GoogleLinkError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("一覧と削除も v4", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return init?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ localPosts: [POST] });
    });
    const options = { fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => "t", reviewsEndpoint: "https://v4.test/v4" };
    const page = await listLocalPosts("accounts/1/locations/2", null, options);
    expect(page.posts).toHaveLength(1);
    expect(calls[0]?.url).toBe(`https://v4.test/v4/accounts/1/locations/2/localPosts?pageSize=${LOCAL_POSTS_PAGE_SIZE}`);
    await deleteLocalPost(POST.name, options);
    expect(calls[1]?.url).toBe(`https://v4.test/v4/${POST.name}`);
    expect(calls[1]?.init?.method).toBe("DELETE");
  });

  it("投稿の指定が正しくなければ例外（削除）", async () => {
    await expect(deleteLocalPost("accounts/1/locations/2", { getToken: async () => "t" })).rejects.toThrow(GoogleLinkError);
  });
});
