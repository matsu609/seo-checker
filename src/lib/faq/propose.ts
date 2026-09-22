/**
 * FAQ 提案の組み立て。ページを 1 枚取得し、いまの FAQ の状態（事実）を出し、
 * その所見と本文を AI に渡して「入れるべき FAQ」にする。
 *
 * 対象は 1 ページずつ（HP 改修提案と同じ理由。サイト全体を一括で回すと
 * Anthropic の実費と実行時間が読めなくなる）。
 *
 * **このツールはホームページを書き換えない**（利用者の決定 2026-09-22）。
 * 作るのは貼る内容（JSON-LD と HTML）までで、反映はお客様・運用者の作業。
 */
import * as cheerio from "cheerio";
import { extractContent } from "@/lib/analyzer/content";
import { assertPublicHost, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import { extractMeta } from "@/lib/analyzer/meta";
import { generateStructured } from "@/lib/llm/structured";
import { auditFaq, type FaqAudit } from "./audit";
import { buildFaqPrompt, SYSTEM_PROMPT } from "./prompt";
import { FaqProposalSetSchema, type FaqProposalSet } from "./schema";

export interface FaqProposalResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  title: string | null;
  /** 機械的に調べた、いまの FAQ の状態（画面で根拠として並べる） */
  audit: FaqAudit;
  /** AI が作った提案。確認だけのときは null */
  proposals: FaqProposalSet | null;
  /** 使ったトークン（費用の目安として画面に出す）。確認だけのときは null */
  usage: { inputTokens: number; outputTokens: number } | null;
}

/** 生成の 1 回分。テストで差し替えられるようにこの形で受ける */
export type FaqProposalGenerator = (args: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
}) => Promise<{ set: FaqProposalSet; usage: { inputTokens: number; outputTokens: number } }>;

/** 既定の生成。Anthropic の構造化出力を使う */
export const defaultGenerator: FaqProposalGenerator = async ({ system, prompt, signal }) => {
  const { data, usage } = await generateStructured({
    schema: FaqProposalSetSchema,
    system,
    prompt,
    // そのままホームページに貼られる文章なので、速い方ではなく既定のモデルを使う
    model: "default",
    maxTokens: 8_000,
    signal,
  });
  return { set: data, usage };
};

export interface ProposeFaqOptions {
  url: string;
  keyword?: string;
  /** お客様カルテの要約（任意）。ルートが currentKarteBrief() で渡す */
  brief?: string;
  /** true なら AI を呼ばず、いまの状態（事実）だけを返す。実費が出ない */
  auditOnly?: boolean;
  signal?: AbortSignal;
  /** テスト用。省略時は Anthropic を呼ぶ */
  generator?: FaqProposalGenerator;
}

export async function proposeFaq(options: ProposeFaqOptions): Promise<FaqProposalResult> {
  const url = normalizeUrl(options.url);
  await assertPublicHost(url);

  const fetched = await fetchText(url.toString());
  if (!fetched.ok) {
    throw new Error(`ページを取得できませんでした（HTTP ${fetched.status}）`);
  }

  const audit = auditFaq(fetched.body);
  // auditFaq は自分の cheerio を持つ（script を落とすため）。本文とメタはここで別に取る
  const $ = cheerio.load(fetched.body);
  const meta = extractMeta($);
  const { mainText } = extractContent(fetched.body, fetched.finalUrl, $);

  const base = {
    url: url.toString(),
    finalUrl: fetched.finalUrl,
    fetchedAt: new Date().toISOString(),
    title: meta.title,
    audit,
  };
  if (options.auditOnly) {
    return { ...base, proposals: null, usage: null };
  }

  const generate = options.generator ?? defaultGenerator;
  const { set, usage } = await generate({
    system: SYSTEM_PROMPT,
    prompt: buildFaqPrompt({
      url: url.toString(),
      title: meta.title,
      description: meta.description,
      bodyText: mainText,
      audit,
      keyword: options.keyword,
      brief: options.brief,
    }),
    signal: options.signal,
  });

  return { ...base, proposals: normalize(set), usage };
}

/**
 * 出力をそろえる。
 * 根拠の無い提案（needs-check）に答えが入っていたら捨てる — ここを通さないと、
 * 「根拠はありませんが」と言いながら作った事実がそのままページに貼られる。
 */
function normalize(set: FaqProposalSet): FaqProposalSet {
  return {
    summary: set.summary.map((s) => s.trim()).filter(Boolean),
    proposals: set.proposals
      .map((p) => ({
        ...p,
        question: p.question.trim(),
        answer: p.basis === "needs-check" ? "" : p.answer.trim(),
        why: p.why.trim(),
        askCustomer: p.basis === "needs-check" ? p.askCustomer.trim() : "",
      }))
      .filter((p) => p.question),
  };
}
