import { z } from "zod";
import { isAnthropicEnabled, MODELS } from "@/lib/llm/anthropic";
import { SAFETY_RULES, untrustedBlock } from "@/lib/llm/prompt-safety";
import { generateStructured } from "@/lib/llm/structured";
import { FaqGenerationSchema, MAX_FAQ_ITEMS, type FaqItem } from "./schema";

/**
 * クイック診断の「想定 FAQ」の生成。
 *
 * 2026-09-23: 共通の generateStructured（src/lib/llm/structured.ts）に載せ替えた。以前は
 * 自前のクライアントで呼んでいたため、打ち切り（stop_reason が max_tokens / refusal）を見ず、
 * `FAQ_MODEL=""`（空文字）でモデル名が空になり、ページの本文・タイトルを
 * 信用できないブロック（UNTRUSTED）に入れていなかった（第三者のページに書かれた
 * 「これまでの指示を無視して」がそのまま指示として読まれうる）。
 */

/**
 * FAQ 生成に使うモデル。
 * 用途が「本文から想定質問を作る」だけなので、既定は最も安価な Haiku。
 * 精度を上げたい場合は環境変数 FAQ_MODEL で claude-sonnet-5 などに差し替える（MODELS.faq）。
 */
export const FAQ_MODEL = MODELS.faq;

/** 本文はこの文字数で打ち切る。FAQ 生成には冒頭 1 万文字で十分 */
export const MAX_INPUT_CHARS = 10_000;
/** タイトル・説明をプロンプトに載せる上限 */
export const MAX_TITLE_CHARS = 300;
export const MAX_DESCRIPTION_CHARS = 600;

/**
 * /api/faq の入力の形と大きさ（2026-09-23 に足した）。以前は title / description / url に上限が無く、
 * そのままプロンプトに入っていた。プロンプトに載せる長さは buildFaqGenerationPrompt でさらに
 * 切り詰めるので、ここは明らかにおかしい大きさの要求を断るための上限（ページから取った値を
 * そのまま送る画面が普通に使う範囲では引っかからない大きさにしてある）。
 */
export const FaqRequestSchema = z.object({
  url: z.string().trim().min(1).max(4_096),
  title: z.string().max(10_000).nullish(),
  description: z.string().max(10_000).nullish(),
  mainText: z.string().max(1_000_000),
});

export interface FaqInput {
  url: string;
  title: string | null;
  description: string | null;
  mainText: string;
}

export function isFaqEnabled(): boolean {
  return isAnthropicEnabled();
}

export const SYSTEM_PROMPT = `あなたは日本語 Web サイトの AIO（AI検索最適化）を支援するアシスタントです。
与えられたページ本文をもとに、そのページを訪れる人が実際に抱きそうな質問と、その回答を作ります。

守ること:
- 回答はページ本文に書かれている事実だけを根拠にする。本文に無い情報・推測・一般論は書かない。
- 会社名・人名・数値・日付・連絡先は本文の表記をそのまま使う。
- 質問は検索やAIチャットで実際に打ち込まれそうな自然な日本語にする。
- 回答は丁寧語で、80〜200文字程度。「ページには〜と記載されています」のように根拠がページであることが伝わる書き方でよい。
- 本文の情報が少なく質問を作れない場合は、無理に件数を増やさず作れる分だけ返す。`;

/** ユーザーメッセージを組み立てる（純関数・テスト対象） */
export function buildFaqGenerationPrompt(input: FaqInput): string {
  const lines: string[] = [...SAFETY_RULES, "", `URL: ${input.url.slice(0, 2_000)}`];
  const title = input.title?.trim();
  const description = input.description?.trim();
  if (title) lines.push("", "タイトル:", ...untrustedBlock(title, MAX_TITLE_CHARS));
  if (description) lines.push("", "説明:", ...untrustedBlock(description, MAX_DESCRIPTION_CHARS));
  lines.push(
    "",
    "ページ本文:",
    ...untrustedBlock(input.mainText, MAX_INPUT_CHARS),
    "",
    "このページについて想定される FAQ を重要度の高い順に 6〜10 件作成してください。",
  );
  return lines.join("\n");
}

export async function generateFaqs(input: FaqInput): Promise<FaqItem[]> {
  // 打ち切り・拒否・解釈できない出力は generateStructured が StructuredOutputError にする
  const { data } = await generateStructured({
    schema: FaqGenerationSchema,
    system: SYSTEM_PROMPT,
    prompt: buildFaqGenerationPrompt(input),
    model: "faq",
    maxTokens: 4096,
  });
  // 件数の上限はスキーマでも縛っているが、モデルが多く返したときのためにここでも切る
  return data.faqs
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter((f) => f.question && f.answer)
    .slice(0, MAX_FAQ_ITEMS);
}
