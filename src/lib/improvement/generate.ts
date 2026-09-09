/**
 * 改修提案の組み立て。ページを 1 枚取得し、機械的な診断を出し、
 * その所見と実際の内容を AI に渡して before → after の改修案にする。
 *
 * 対象は 1 ページずつ。サイト全体を一括で回すと Anthropic の実費と
 * 実行時間が読めなくなるため、意図的に絞っている。
 */
import { extractContent } from "@/lib/analyzer/content";
import { fetchSiteFiles } from "@/lib/analyzer/robots";
import { fetchText, normalizeUrl, assertPublicHost } from "@/lib/analyzer/fetch";
import { generateStructured } from "@/lib/llm/structured";
import { buildPageReport } from "@/lib/page-report/analyze";
import type { PageReport } from "@/lib/page-report/types";
import * as cheerio from "cheerio";
import { buildImprovementPrompt, SYSTEM_PROMPT } from "./prompt";
import { ImprovementSchema, type ImprovementPlan } from "./schema";

export interface ImprovementResult {
  url: string;
  finalUrl: string;
  fetchedAt: string;
  /** 機械的な診断（画面で根拠として並べる） */
  report: PageReport;
  /** AI が作った改修案 */
  plan: ImprovementPlan;
  /** 使ったトークン（費用の目安として画面に出す） */
  usage: { inputTokens: number; outputTokens: number };
}

/** 生成の 1 回分。テストで差し替えられるようにこの形で受ける */
export type ImprovementGenerator = (args: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
}) => Promise<{ plan: ImprovementPlan; usage: { inputTokens: number; outputTokens: number } }>;

/** 既定の生成。Anthropic の構造化出力を使う */
export const defaultGenerator: ImprovementGenerator = async ({ system, prompt, signal }) => {
  const { data, usage } = await generateStructured({
    schema: ImprovementSchema,
    system,
    prompt,
    // 提案の質が結果の価値そのものなので、速い方ではなく既定のモデルを使う
    model: "default",
    maxTokens: 8_000,
    signal,
  });
  return { plan: data, usage };
};

export interface GenerateImprovementOptions {
  url: string;
  keyword?: string;
  signal?: AbortSignal;
  /** テスト用。省略時は Anthropic を呼ぶ */
  generator?: ImprovementGenerator;
}

export async function generateImprovement(
  options: GenerateImprovementOptions,
): Promise<ImprovementResult> {
  const url = normalizeUrl(options.url);
  await assertPublicHost(url);

  const fetched = await fetchText(url.toString());
  if (!fetched.ok) {
    throw new Error(`ページを取得できませんでした（HTTP ${fetched.status}）`);
  }

  const origin = new URL(fetched.finalUrl).origin;
  const siteFiles = await fetchSiteFiles(origin);
  const report = buildPageReport(fetched, siteFiles, { requestedUrl: url.toString() });

  const $ = cheerio.load(fetched.body);
  const { mainText } = extractContent(fetched.body, fetched.finalUrl, $);

  const generate = options.generator ?? defaultGenerator;
  const { plan, usage } = await generate({
    system: SYSTEM_PROMPT,
    prompt: buildImprovementPrompt({ report, bodyText: mainText, keyword: options.keyword }),
    signal: options.signal,
  });

  return {
    url: url.toString(),
    finalUrl: fetched.finalUrl,
    fetchedAt: new Date().toISOString(),
    report,
    plan,
    usage,
  };
}
