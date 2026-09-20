/**
 * 投稿の下書きを AI が作る。サーバー専用。
 *
 * 店舗の情報（店名・カテゴリ・地域・対策キーワード）と月・回数から、週 1 本の投稿を count 本。
 * Google の投稿ポリシーに沿って、誇大な表現・数字の作り話・他店の名前は書かせない。
 * モデルは高速モデル（本文は短く、月に数本）。
 */
import { z } from "zod";
import { MODELS } from "@/lib/llm/anthropic";
import { generateStructured } from "@/lib/llm/structured";
import { POST_SUMMARY_MAX, POST_TITLE_MAX, type PostInput, type PostTopic } from "./types";

const DraftSchema = z.object({
  posts: z.array(
    z.object({
      topicType: z.enum(["STANDARD", "EVENT", "OFFER"]).describe("最新情報は STANDARD。季節の催しは EVENT。特典は OFFER（根拠が無ければ STANDARD にする）"),
      title: z.string().describe("EVENT / OFFER の題名（30 文字以内）。STANDARD は空文字"),
      summary: z.string().describe("本文。150〜300 文字。段落は 1〜2 つ。絵文字とハッシュタグは使わない。URL は書かない"),
    }),
  ),
});

export const SYSTEM_PROMPT = `あなたは、地域の店舗の Google ビジネス プロフィール（Google マップ）の「投稿」を書くアシスタントです。
店舗のオーナーがそのまま投稿できる本文を、依頼された本数だけ書きます。1 本 = 1 週間分（週 1 回の投稿が目標）。

守ること:
- 日本語。店舗の立場（「当店」「私たち」）で、来店客に向けて書く。
- 事実として分かっていること（店名・カテゴリ・地域・対策キーワード・季節）だけを使う。価格・割引・実績・口コミの数など、渡されていない数字や事実を作らない。
- 対策キーワードは 1 本につき 1〜2 語を自然に含める（詰め込まない）。地域名も自然に。
- 誇大な表現（「日本一」「絶対」「必ず」）、他店の名前、医療・効果効能の断定、絵文字、ハッシュタグ、URL は使わない。
- 本文は 150〜300 文字。1〜2 段落。最後に来店や問い合わせを促す一言。
- 本数ぶん、話題を変える（季節の話題・サービスの紹介・営業案内・よくある質問への答え・スタッフの紹介など）。
- OFFER（特典）は、渡された情報に特典の根拠が無ければ使わない。EVENT は季節の催しなど期間のあるものだけ。`;

export interface PostDraftInput {
  storeName: string;
  category: string;
  region: string;
  keywords: readonly string[];
  /** 例: "2026 年 10 月" */
  month: string;
  /** 利用者の指定（話題・特典の内容など。任意） */
  theme: string;
  /** 直近の投稿の冒頭（同じ話題を避ける。任意） */
  recent: readonly string[];
  count: number;
}

/** AI に渡す本文（純粋関数。テスト用に公開） */
export function buildDraftPrompt(input: PostDraftInput): string {
  return [
    `店舗「${input.storeName}」の Google ビジネス プロフィールの投稿を ${input.count} 本書いてください。`,
    `カテゴリ: ${input.category || "（不明）"}`,
    `地域: ${input.region || "（不明）"}`,
    `対策キーワード: ${input.keywords.length > 0 ? input.keywords.join("、") : "（無し）"}`,
    `時期: ${input.month}`,
    input.theme.trim() ? `オーナーからの指定: ${input.theme.trim().slice(0, 500)}` : "オーナーからの指定: なし",
    input.recent.length > 0 ? `最近の投稿の冒頭（同じ話題を避ける）: ${input.recent.map((r) => `「${r.slice(0, 60)}」`).join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function draftModel(): string {
  return process.env.POST_DRAFT_MODEL?.trim() || MODELS.fast;
}

/** 下書きを作る。SDK の例外はそのまま投げる（Route Handler 側で toApiError に通す） */
export async function generatePostDrafts(input: PostDraftInput, options: { signal?: AbortSignal } = {}): Promise<Omit<PostInput, "scheduledAt">[]> {
  const { data } = await generateStructured({
    schema: DraftSchema,
    system: SYSTEM_PROMPT,
    prompt: buildDraftPrompt(input),
    model: draftModel(),
    maxTokens: 4000,
    signal: options.signal,
  });
  return data.posts.slice(0, input.count).map((p) => ({
    topicType: p.topicType as PostTopic,
    title: p.topicType === "STANDARD" ? "" : p.title.trim().slice(0, POST_TITLE_MAX),
    summary: p.summary.trim().slice(0, POST_SUMMARY_MAX),
    ctaType: "NONE" as const,
    ctaUrl: "",
    eventStart: null,
    eventEnd: null,
  }));
}
