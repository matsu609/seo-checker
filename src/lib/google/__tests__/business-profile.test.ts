/**
 * Business Profile API クライアント: 応答の解析（純関数）と、呼び出しの形（URL・メソッド・本文・エラー）。
 */
import { describe, expect, it, vi } from "vitest";
import {
  deleteReply,
  isLocationName,
  isReviewName,
  listAllLocations,
  listReviews,
  parseAccounts,
  parseLocations,
  parseReviews,
  replyToReview,
  starToNumber,
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
    expect(missingScopes([BUSINESS_PROFILE_SCOPE])).toHaveLength(2);
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
