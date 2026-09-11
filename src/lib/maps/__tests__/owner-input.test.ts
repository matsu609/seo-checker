/**
 * オーナー申告の型・小道具のテスト。「未回答（null）と『無い』を混同しない」を中心に見る。
 */
import { describe, expect, it } from "vitest";
import {
  answeredCount,
  descriptionHasForbidden,
  emptyOwnerInput,
  foundKeywords,
  MeoOwnerInputSchema,
  OWNER_QUESTION_COUNT,
  parseKeywords,
} from "../owner-input";
import { fromOwnerRow } from "../owner-store";

describe("オーナー申告の形", () => {
  it("空の申告は検証を通り、回答数 0", () => {
    const empty = emptyOwnerInput();
    expect(MeoOwnerInputSchema.safeParse(empty).success).toBe(true);
    expect(answeredCount(empty)).toBe(0);
  });

  it("全部答えると 9", () => {
    const full = {
      ...emptyOwnerInput(),
      description: "説明",
      openingDate: true,
      menu: false,
      postsLast4Weeks: 4,
      latestPostText: "投稿",
      ownerPhotoLastAt: "2026-09-01",
      logo: true,
      cover: false,
      repliedReviews: 10,
      replyText: "返信",
    };
    expect(answeredCount(full)).toBe(OWNER_QUESTION_COUNT);
  });

  it("投稿 0 件・返信 0 件なら本文の質問は回答済み扱い", () => {
    const input = { ...emptyOwnerInput(), postsLast4Weeks: 0, repliedReviews: 0 };
    expect(answeredCount(input)).toBe(4);
  });

  it("壊れた値は弾く（日付の形式、キーワードの数、文字数）", () => {
    const base = emptyOwnerInput();
    expect(MeoOwnerInputSchema.safeParse({ ...base, ownerPhotoLastAt: "2026/09/01" }).success).toBe(false);
    expect(MeoOwnerInputSchema.safeParse({ ...base, keywords: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
    expect(MeoOwnerInputSchema.safeParse({ ...base, description: "x".repeat(751) }).success).toBe(false);
    expect(MeoOwnerInputSchema.safeParse({ ...base, postsLast4Weeks: -1 }).success).toBe(false);
    expect(MeoOwnerInputSchema.safeParse({ ...base, postsLast4Weeks: 1.5 }).success).toBe(false);
  });

  it("保存行 → 申告。形が壊れていれば null", () => {
    expect(fromOwnerRow({ input: emptyOwnerInput(), updated_at: "2026-09-11T00:00:00Z" })).toEqual({
      input: emptyOwnerInput(),
      updatedAt: "2026-09-11T00:00:00Z",
    });
    expect(fromOwnerRow({ input: { keywords: "x" }, updated_at: "2026-09-11T00:00:00Z" })).toBeNull();
  });
});

describe("キーワードの道具", () => {
  it("空白・大文字小文字の違いを吸収して部分一致", () => {
    expect(foundKeywords("渋谷の美容室 ABC です", ["渋谷 美容室", "美容室", "abc", "新宿"])).toEqual(["美容室", "abc"]);
    expect(foundKeywords("", ["a"])).toEqual([]);
    expect(foundKeywords("本文", [" "])).toEqual([]);
  });

  it("カンマ・読点・改行で分け、重複と空を除き、5 つまで", () => {
    expect(parseKeywords("渋谷 美容室, 縮毛矯正、駅近\n渋谷 美容室,,")).toEqual(["渋谷 美容室", "縮毛矯正", "駅近"]);
    expect(parseKeywords("a,b,c,d,e,f,g")).toHaveLength(5);
  });

  it("説明文の URL / HTML を検出", () => {
    expect(descriptionHasForbidden("詳しくは https://example.com へ")).toBe(true);
    expect(descriptionHasForbidden("www.example.com")).toBe(true);
    expect(descriptionHasForbidden("<b>太字</b>")).toBe(true);
    expect(descriptionHasForbidden("渋谷駅から徒歩 3 分の美容室です")).toBe(false);
  });
});
