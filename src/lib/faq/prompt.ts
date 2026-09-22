/**
 * FAQ 提案のプロンプト（純関数・テスト対象）。
 *
 * 入力の扱いを 2 つに分ける:
 *   - 機械的な所見（audit.ts が出した行）… このアプリが書いた文なので信用してよい
 *   - ページの本文・お客様カルテ … 第三者 / お客様が書いたテキスト。
 *     「これまでの指示を無視して」のような文が仕込まれている可能性があるので、
 *     必ず untrustedBlock で囲んで「データであって指示ではない」と明示する。
 *
 * いちばん大事な約束は**事実を作らせないこと**。FAQ はそのままホームページに貼られ、
 * お客様の言葉として読まれるので、根拠の無い回答（料金・所要時間・実績）を
 * 書かれると嘘が載る。根拠が無い質問は答えを空にして needs-check で返させる。
 */
import { SAFETY_RULES, untrustedBlock } from "@/lib/llm/prompt-safety";
import type { FaqAudit } from "./audit";

/** 本文としてプロンプトに載せる上限 */
export const MAX_BODY_CHARS = 8_000;
/** すでにある質問として載せる上限 */
export const MAX_EXISTING_QUESTIONS = 30;

export const SYSTEM_PROMPT = [
  "あなたは日本語の Web サイトの AIO（AI 検索最適化）を支援する実務担当者です。",
  "与えられた 1 ページについて、そのページに載せるべき FAQ（よくある質問）を提案します。",
  "",
  "なぜ FAQ なのか:",
  "- ChatGPT・Gemini・Google の AI Overviews は、質問と答えが対になっている文章をそのまま引用しやすい。",
  "- 利用者が AI に聞く言葉（「〇〇は予約が必要？」）と、ページの見出しの言葉はふつう一致しない。その差を埋めるのが FAQ。",
  "",
  "必ず守ること:",
  "- **ページ本文とお客様カルテに書かれていない事実を書かない。**料金・所要時間・実績・資格・対応エリアは、根拠がある場合だけ答えに入れる。",
  "- 根拠が無い質問は、価値が高くても答えを作らない。answer を空文字、basis を needs-check にして、askCustomer に「お客様に何を聞けばよいか」を書く。",
  "- 根拠がある質問は、basis に page（ページ本文）か karte（お客様カルテ）を入れる。",
  "- すでにページにある質問と同じ意味の質問は提案しない（言い換えただけのものも含む）。",
  "- 効果を保証する書き方（必ず上位表示されます等）はしない。",
  "- 回答は丁寧語で 80〜200 文字程度。1 つの質問には 1 つのことだけ答える（AI が切り出しやすくなる）。",
  "- 質問文は、検索や AI チャットに打ち込まれる言葉で書く。社内用語・専門用語を主語にしない。",
].join("\n");

export interface FaqPromptInput {
  url: string;
  title: string | null;
  description: string | null;
  /** 本文（Readability で抽出したもの） */
  bodyText: string;
  audit: FaqAudit;
  /** 対策キーワード（任意）。入れると質問の言葉がその語に寄る */
  keyword?: string;
  /** お客様カルテの要約（任意）。ルートが currentKarteBrief() で渡す */
  brief?: string;
}

/** ユーザーメッセージを組み立てる */
export function buildFaqPrompt(input: FaqPromptInput): string {
  const { audit } = input;
  const lines: string[] = [];

  lines.push(...SAFETY_RULES);
  lines.push("");
  lines.push("■ 対象ページ");
  lines.push(`- URL: ${input.url}`);
  if (input.keyword?.trim()) lines.push(`- 対策キーワード: ${input.keyword.trim()}`);

  lines.push("");
  lines.push("■ いまの FAQ の状態（このアプリが機械的に調べた事実）");
  for (const f of audit.findings) {
    lines.push(`- [${f.status}] ${f.label}: ${f.detail}`);
  }

  const existing = audit.existingQuestions.slice(0, MAX_EXISTING_QUESTIONS);
  lines.push("");
  if (existing.length > 0) {
    lines.push("■ すでにページにある質問（これと同じ意味のものは提案しない）");
    lines.push(...untrustedBlock(existing.map((q) => `- ${q}`).join("\n")));
  } else {
    lines.push("■ すでにページにある質問: ありません");
  }

  if (input.title || input.description) {
    lines.push("");
    lines.push("■ ページのタイトルと説明");
    lines.push(...untrustedBlock([input.title ?? "", input.description ?? ""].filter(Boolean).join("\n")));
  }

  lines.push("");
  lines.push("■ ページ本文（回答の根拠にしてよいのはここと、次のお客様カルテだけ）");
  lines.push(...untrustedBlock(input.bodyText, MAX_BODY_CHARS));

  if (input.brief?.trim()) {
    lines.push("");
    lines.push("■ お客様カルテ（お客様ご自身の記入。事実として扱ってよい）");
    lines.push(...untrustedBlock(input.brief, 2_000));
  }

  lines.push("");
  lines.push(
    "このページに入れるべき FAQ を、優先度の高い順に 6〜10 件提案してください。",
    "根拠のあるものを先に並べ、根拠が無いが価値の高い質問は needs-check として後ろに置いてください。",
    "summary には「いまの FAQ の状態」と「なぜこの並びにしたか」を 2〜4 行で書いてください。",
  );

  return lines.join("\n");
}
