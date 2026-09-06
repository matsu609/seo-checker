import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { FaqGenerationSchema, type FaqItem } from "./schema";

/**
 * FAQ 生成に使うモデル。
 * 用途が「本文から想定質問を作る」だけなので、既定は最も安価な Haiku。
 * 精度を上げたい場合は環境変数 FAQ_MODEL で claude-sonnet-5 などに差し替える。
 */
export const FAQ_MODEL = process.env.FAQ_MODEL ?? "claude-haiku-4-5";

/** 本文はこの文字数で打ち切る。FAQ 生成には冒頭 1 万文字で十分 */
export const MAX_INPUT_CHARS = 10_000;

export interface FaqInput {
  url: string;
  title: string | null;
  description: string | null;
  mainText: string;
}

export function isFaqEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SYSTEM_PROMPT = `あなたは日本語 Web サイトの AIO（AI検索最適化）を支援するアシスタントです。
与えられたページ本文をもとに、そのページを訪れる人が実際に抱きそうな質問と、その回答を作ります。

守ること:
- 回答はページ本文に書かれている事実だけを根拠にする。本文に無い情報・推測・一般論は書かない。
- 会社名・人名・数値・日付・連絡先は本文の表記をそのまま使う。
- 質問は検索やAIチャットで実際に打ち込まれそうな自然な日本語にする。
- 回答は丁寧語で、80〜200文字程度。「ページには〜と記載されています」のように根拠がページであることが伝わる書き方でよい。
- 本文の情報が少なく質問を作れない場合は、無理に件数を増やさず作れる分だけ返す。`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export async function generateFaqs(input: FaqInput): Promise<FaqItem[]> {
  const text = input.mainText.slice(0, MAX_INPUT_CHARS);
  const userPrompt = [
    `URL: ${input.url}`,
    input.title ? `タイトル: ${input.title}` : null,
    input.description ? `説明: ${input.description}` : null,
    "",
    "--- ページ本文 ---",
    text,
    "--- ここまで ---",
    "",
    "このページについて想定される FAQ を重要度の高い順に 6〜10 件作成してください。",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const response = await getClient().messages.parse({
    model: FAQ_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(FaqGenerationSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("FAQ の生成結果を解釈できませんでした");
  }
  return parsed.faqs
    .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter((f) => f.question && f.answer);
}
