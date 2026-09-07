/**
 * 一発生成（D1）の本文生成（サーバー専用の既定実装 + 純関数）。
 *
 * 見出し（h2）ごとに 1 回ずつ生成し、前後の見出しを文脈として渡す。
 * 1 回の応答をストリーミングで受け、NDJSON のイベント列に変換する。
 * 生成回数と総文字数には上限を設ける（暴走したときに止まらなくなるため）。
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, MODELS } from "@/lib/llm/anthropic";
import { MAX_SECTIONS } from "./outline";
import { SAFETY_RULES, toneInstruction } from "./prompt";
import type { ArticleOutline, BodyStreamEvent, OutlineSection, WritingTone } from "./types";

/** 記事全体の出力上限（これを超えたら打ち切って done を出す） */
export const MAX_BODY_CHARS = 40_000;
/** 1 見出しあたりの出力上限 */
export const MAX_SECTION_OUTPUT_CHARS = 6_000;

export const BODY_SYSTEM = [
  "あなたは日本語の SEO 記事を書くライターです。",
  "与えられた構成案の 1 見出し分だけを、そのまま公開できる品質の Markdown で書きます。",
  "",
  ...SAFETY_RULES,
  "",
  "【出力の方針】",
  "・指定された h2 見出しの行（## で始まる行）から書き始め、その見出しの担当範囲だけを書いてください。",
  "・他の見出しの内容には踏み込まず、次の見出しへの前振りも書かないでください。",
  "・h3 が指定されているときは ### の見出しとして使ってください。",
  "・事実として確認できないことは断定せず、数値・固有名詞をでっち上げないでください。",
  "・箇条書き・表を適度に使い、1 段落は 3 文程度にしてください。",
  "・前置き（「承知しました」など）や補足説明は出力せず、記事本文だけを返してください。",
].join("\n");

export interface SectionPromptInput {
  keyword: string;
  outline: ArticleOutline;
  index: number;
  tone: WritingTone;
  /** すでに書き終えた部分の末尾（重複を避けるための文脈） */
  previousTail?: string;
}

/** 見出し 1 本分のプロンプト（純関数・テスト対象） */
export function buildSectionPrompt(input: SectionPromptInput): string {
  const section = input.outline.outline[input.index];
  const lines: string[] = [
    `対策キーワード: ${input.keyword}`,
    `検索意図: ${input.outline.search_intent}`,
    `読者像: ${input.outline.audience}`,
    toneInstruction(input.tone),
    "",
    "■ 記事全体の構成（担当箇所以外は書かないでください）",
    ...input.outline.outline.map(
      (s, i) => `${i === input.index ? "▶" : "　"} ${i + 1}. ## ${s.h2}${s.h3.length > 0 ? `（${s.h3.join(" / ")}）` : ""}`,
    ),
    "",
    "■ あなたが書く見出し",
    `## ${section.h2}`,
  ];
  if (section.h3.length > 0) {
    lines.push("配下の h3:");
    lines.push(...section.h3.map((h) => `### ${h}`));
  }
  lines.push(`狙い: ${section.goal}`);
  lines.push(`想定文字数: 約 ${section.target_chars} 文字`);

  if (input.previousTail?.trim()) {
    lines.push("");
    lines.push("■ 直前までに書いた本文の末尾（重複を避けるための参考。続きから書いてください）");
    lines.push(input.previousTail.trim().slice(-800));
  }

  lines.push("");
  lines.push(`「## ${section.h2}」の行から始まる Markdown を返してください。`);
  return lines.join("\n");
}

export interface SectionStreamInput {
  system: string;
  prompt: string;
  maxTokens: number;
  signal?: AbortSignal;
}

/** 差し替え可能な本文ストリーム（テストは文字列を順に返す関数を渡す） */
export type SectionStreamer = (input: SectionStreamInput) => AsyncIterable<string>;

/** 既定のストリーマ（Anthropic Messages API のストリーミング） */
export const llmSectionStreamer: SectionStreamer = async function* ({ system, prompt, maxTokens, signal }) {
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];
  const stream = getAnthropicClient().messages.stream(
    { model: MODELS.default, max_tokens: maxTokens, system, messages },
    signal ? { signal } : undefined,
  );
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
};

export interface BodyInput {
  keyword: string;
  outline: ArticleOutline;
  tone?: WritingTone;
  signal?: AbortSignal;
}

/** 生成する見出しの一覧（上限で切る。純関数） */
export function sectionsToWrite(outline: ArticleOutline): OutlineSection[] {
  return outline.outline.filter((s) => s.h2.trim().length > 0).slice(0, MAX_SECTIONS);
}

/**
 * 見出しごとに本文を生成して NDJSON 用のイベント列にする。
 * 中止されたら静かに終わる（ストリーム開始後はステータスを変えられないため、
 * エラーも done も行として流す）。
 */
export async function* streamBody(
  input: BodyInput,
  streamer: SectionStreamer = llmSectionStreamer,
): AsyncGenerator<BodyStreamEvent> {
  const sections = sectionsToWrite(input.outline);
  if (sections.length === 0) {
    yield { type: "error", error: "構成案に見出しがありません。先に構成案を作成してください" };
    return;
  }
  const tone: WritingTone = input.tone ?? "desu";
  const outline: ArticleOutline = { ...input.outline, outline: sections };

  let total = 0;
  let previousTail = "";

  for (let index = 0; index < sections.length; index += 1) {
    if (input.signal?.aborted) return;
    const section = sections[index];
    yield { type: "section-start", index, total: sections.length, h2: section.h2 };

    let markdown = "";
    const iterable = streamer({
      system: BODY_SYSTEM,
      prompt: buildSectionPrompt({
        keyword: input.keyword,
        outline,
        index,
        tone,
        ...(previousTail ? { previousTail } : {}),
      }),
      // 想定文字数から必要トークン数を見積もる（日本語 1 文字 ≒ 1 トークン強）
      maxTokens: Math.min(8_000, Math.max(1_500, section.target_chars * 3)),
      ...(input.signal ? { signal: input.signal } : {}),
    });

    for await (const text of iterable) {
      if (input.signal?.aborted) return;
      if (!text) continue;
      const room = MAX_SECTION_OUTPUT_CHARS - markdown.length;
      const chunk = text.length > room ? text.slice(0, Math.max(0, room)) : text;
      if (chunk) {
        markdown += chunk;
        yield { type: "delta", index, text: chunk };
      }
      if (markdown.length >= MAX_SECTION_OUTPUT_CHARS) break;
    }

    total += markdown.length;
    previousTail = markdown;
    yield { type: "section-end", index, markdown };

    if (total >= MAX_BODY_CHARS) {
      yield { type: "error", error: `本文が上限（${MAX_BODY_CHARS} 文字）に達したため、途中で生成を打ち切りました` };
      break;
    }
  }

  if (input.signal?.aborted) return;
  yield { type: "done", sections: sections.length, chars: total };
}

/** 本文生成に使うモデル（画面の注記用） */
export const BODY_MODEL = MODELS.default;
