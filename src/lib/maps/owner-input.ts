/**
 * オーナー申告（Google マップの公開情報では取れない 9 項目を、店舗のオーナーが自分で入力する）。
 * 純粋な型・検証・小道具だけ（クライアントからも読める）。
 *
 * Places API では説明文・開業日・メニュー・投稿・写真の日付・ロゴ/カバー・返信が取れない。
 * Business Profile API（オーナー権限、承認待ち）が使えるまでは、ここで受けた申告で同じ
 * 採点（src/lib/maps/score.ts）を埋める。承認後は同じ形に API の値を流し込めばよい。
 *
 * すべて null = 未回答（その項目は「未取得」のまま採点から外す）。
 * 部分的に答えても、答えた分だけ採点に入る。
 */
import { z } from "zod";

export const MAX_KEYWORDS = 5;
export const MAX_KEYWORD_CHARS = 30;
/** Google ビジネス プロフィールの説明文の上限 */
export const DESCRIPTION_MAX = 750;
/** 説明文はこれ以上あると十分とみなす */
export const DESCRIPTION_GOOD = 200;
export const MAX_POST_TEXT = 1500;
export const MAX_REPLY_TEXT = 1500;
/** 「週 1 投稿以上」= 直近 4 週間に 4 件以上 */
export const POSTS_GOOD = 4;
/** オーナー写真は 1 か月以内なら合格 */
export const PHOTO_FRESH_DAYS = 31;
export const PHOTO_STALE_DAYS = 90;
export const REPLY_RATE_GOOD = 0.9;
export const REPLY_RATE_SOME = 0.5;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const MeoOwnerInputSchema = z.object({
  /** 対策キーワード（地域名・業種など。説明文・投稿・返信に含まれているかを見る） */
  keywords: z.array(z.string().trim().min(1).max(MAX_KEYWORD_CHARS)).max(MAX_KEYWORDS),
  /** ビジネスの説明文。"" = 設定していない、null = 未回答 */
  description: z.string().max(DESCRIPTION_MAX).nullable(),
  openingDate: z.boolean().nullable(),
  menu: z.boolean().nullable(),
  /** 直近 4 週間の投稿数 */
  postsLast4Weeks: z.number().int().min(0).max(999).nullable(),
  /** 最新の投稿の本文 */
  latestPostText: z.string().max(MAX_POST_TEXT).nullable(),
  /** オーナーが最後に写真を追加した日（YYYY-MM-DD） */
  ownerPhotoLastAt: z.string().regex(DATE, "日付は YYYY-MM-DD で入力してください").nullable(),
  logo: z.boolean().nullable(),
  cover: z.boolean().nullable(),
  /** 返信済みの口コミ件数 */
  repliedReviews: z.number().int().min(0).max(100_000).nullable(),
  /** 代表的な返信文（最近のもの 1 件） */
  replyText: z.string().max(MAX_REPLY_TEXT).nullable(),
});

export type MeoOwnerInput = z.infer<typeof MeoOwnerInputSchema>;

/** 保存済みの申告（いつの申告かを報告書に書く） */
export interface MeoOwnerData {
  input: MeoOwnerInput;
  /** ISO 8601 */
  updatedAt: string;
}

export function emptyOwnerInput(): MeoOwnerInput {
  return {
    keywords: [],
    description: null,
    openingDate: null,
    menu: null,
    postsLast4Weeks: null,
    latestPostText: null,
    ownerPhotoLastAt: null,
    logo: null,
    cover: null,
    repliedReviews: null,
    replyText: null,
  };
}

/** 採点に使う質問の数（キーワードは質問ではなく補助入力） */
export const OWNER_QUESTION_COUNT = 9;

/** 9 項目のうち答えた数。投稿・返信の本文は「投稿 0 件」「返信 0 件」なら不要なので回答済みとみなす */
export function answeredCount(input: MeoOwnerInput): number {
  let n = 0;
  if (input.description !== null) n++;
  if (input.openingDate !== null) n++;
  if (input.menu !== null) n++;
  if (input.postsLast4Weeks !== null) n++;
  if (input.latestPostText !== null || input.postsLast4Weeks === 0) n++;
  if (input.ownerPhotoLastAt !== null) n++;
  if (input.logo !== null || input.cover !== null) n++;
  if (input.repliedReviews !== null) n++;
  if (input.replyText !== null || input.repliedReviews === 0) n++;
  return n;
}

/** 空白・記号の違いを吸収して比較する（「渋谷 美容室」と「渋谷の美容室」は別語のまま） */
function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s　]+/g, "");
}

/** 文中に含まれているキーワード（正規化して部分一致） */
export function foundKeywords(text: string, keywords: readonly string[]): string[] {
  const hay = normalize(text);
  if (!hay) return [];
  return keywords.filter((k) => {
    const needle = normalize(k);
    return needle.length > 0 && hay.includes(needle);
  });
}

/** 説明文に URL や HTML が入っていないか（ガイドライン違反） */
export function descriptionHasForbidden(text: string): boolean {
  return /https?:\/\/|www\.|<[a-z][^>]*>/i.test(text);
}

/** カンマ・読点・改行区切りのキーワード文字列を配列にする（重複と空を除く） */
export function parseKeywords(raw: string): string[] {
  const out: string[] = [];
  for (const part of raw.split(/[,、\n]/)) {
    const k = part.trim().slice(0, MAX_KEYWORD_CHARS);
    if (k && !out.includes(k)) out.push(k);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}
