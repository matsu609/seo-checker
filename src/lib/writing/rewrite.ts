/**
 * エディター（D3）のリライト（サーバー専用の既定実装 + 純関数）。
 *
 * 指示（チャット or クイック指示）と対象テキストを渡すと、書き換えた本文だけを
 * ストリーミングで返す。選択範囲があるときは選択部分だけを対象にし、前後の文脈は
 * 参考として渡す（返すのは選択範囲の置き換え後のテキストだけ）。
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, MODELS } from "@/lib/llm/anthropic";
import { MAX_REWRITE_CHARS, QUICK_ACTIONS, stripCodeFence, type QuickActionId } from "./convert";
import { SAFETY_RULES, toneInstruction } from "./prompt";
import type { RewriteStreamEvent, WritingTone } from "./types";

export { QUICK_ACTIONS, stripCodeFence, type QuickActionId };

export const REWRITE_SYSTEM = [
  "あなたは日本語の記事を編集するライターです。指示に従って渡されたテキストを書き換えます。",
  "",
  ...SAFETY_RULES,
  "",
  "【出力の方針】",
  "・書き換えた本文だけを Markdown で返してください。前置き・後書き・説明・コードフェンスは付けないでください。",
  "・指示の範囲を超えて内容を足したり削ったりしないでください。",
  "・事実として確認できない数値・固有名詞を新しく作らないでください。",
  "・見出し記法（#, ##）は元のテキストに含まれていた場合だけ残してください。",
].join("\n");

export interface RewriteInput {
  /** 書き換える対象（選択範囲、または本文全体） */
  target: string;
  /** ユーザーの指示 */
  instruction: string;
  /** 選択範囲リライトのときの前後の文脈 */
  context?: { before?: string; after?: string };
  /** 選択範囲を対象にしているか */
  selection?: boolean;
  keyword?: string;
  /** 関連語（キーワード調査の結果などから渡す） */
  relatedWords?: readonly string[];
  tone?: WritingTone;
  signal?: AbortSignal;
}

/** リライトのプロンプト（純関数・テスト対象） */
export function buildRewritePrompt(input: RewriteInput): string {
  const lines: string[] = [];
  lines.push("■ 指示");
  lines.push(input.instruction.trim().slice(0, 1_000));
  if (input.keyword?.trim()) lines.push(`対策キーワード: ${input.keyword.trim()}`);
  if (input.tone) lines.push(toneInstruction(input.tone));
  if (input.relatedWords && input.relatedWords.length > 0) {
    lines.push(`使える関連語: ${input.relatedWords.slice(0, 30).join(" / ")}`);
  }

  if (input.selection) {
    if (input.context?.before?.trim()) {
      lines.push("");
      lines.push("■ 選択範囲の直前（参考。書き換えないでください）");
      lines.push(input.context.before.trim().slice(-600));
    }
    if (input.context?.after?.trim()) {
      lines.push("");
      lines.push("■ 選択範囲の直後（参考。書き換えないでください）");
      lines.push(input.context.after.trim().slice(0, 600));
    }
  }

  lines.push("");
  lines.push(input.selection ? "■ 書き換える対象（選択範囲）" : "■ 書き換える対象（本文全体）");
  lines.push(input.target.slice(0, MAX_REWRITE_CHARS));
  lines.push("");
  lines.push(
    input.selection
      ? "上の選択範囲を書き換えたテキストだけを返してください（前後の文脈は返さないでください）。"
      : "書き換えた本文だけを返してください。",
  );
  return lines.join("\n");
}

export interface RewriteStreamerInput {
  system: string;
  prompt: string;
  maxTokens: number;
  signal?: AbortSignal;
}

export type RewriteStreamer = (input: RewriteStreamerInput) => AsyncIterable<string>;

export const llmRewriteStreamer: RewriteStreamer = async function* ({ system, prompt, maxTokens, signal }) {
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

/** リライト結果を NDJSON 用のイベント列にする */
export async function* streamRewrite(
  input: RewriteInput,
  streamer: RewriteStreamer = llmRewriteStreamer,
): AsyncGenerator<RewriteStreamEvent> {
  if (!input.target.trim()) {
    yield { type: "error", error: "書き換える本文がありません" };
    return;
  }
  if (!input.instruction.trim()) {
    yield { type: "error", error: "指示を入力してください" };
    return;
  }
  const iterable = streamer({
    system: REWRITE_SYSTEM,
    prompt: buildRewritePrompt(input),
    maxTokens: Math.min(8_000, Math.max(1_500, Math.ceil(input.target.length * 2.5))),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  for await (const text of iterable) {
    if (input.signal?.aborted) return;
    if (text) yield { type: "delta", text };
  }
  if (input.signal?.aborted) return;
  yield { type: "done" };
}


/** リライトに使うモデル（画面の注記用） */
export const REWRITE_MODEL = MODELS.default;
