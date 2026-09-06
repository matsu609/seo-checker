import * as cheerio from "cheerio";
import { checkContent, extractContent } from "./content";
import { assertPublicHost, FetchError, fetchText, normalizeUrl } from "./fetch";
import { checkHeadings, extractHeadings } from "./headings";
import { checkStructuredData, extractJsonLd } from "./jsonld";
import { checkMeta, extractMeta } from "./meta";
import { checkCrawlers } from "./robots";
import { buildCategories, overallScore } from "./scoring";
import type { AnalysisResult, CheckResult } from "./types";

export { FetchError } from "./fetch";
export * from "./types";

/**
 * URL を受け取り、ルールベースの AIO 診断を実行する。
 * AI は一切使わない（API 費用ゼロ）。
 */
export async function analyze(input: string): Promise<AnalysisResult> {
  const url = normalizeUrl(input);
  await assertPublicHost(url);

  const page = await fetchText(url.toString());
  if (page.status === 0) {
    throw new FetchError("ページに接続できませんでした", "network");
  }
  if (!page.ok) {
    throw new FetchError(`ページの取得に失敗しました（HTTP ${page.status}）`, "network");
  }
  if (!page.contentType.includes("html") && !/<html[\s>]/i.test(page.body.slice(0, 2000))) {
    throw new FetchError("HTML ページではないため診断できません", "invalid_url");
  }

  const finalUrl = new URL(page.finalUrl);
  const $ = cheerio.load(page.body);
  const notes: string[] = [];

  if (finalUrl.origin !== url.origin) {
    notes.push(`リダイレクト先 ${finalUrl.toString()} を診断しました`);
  }

  const contentInfo = extractContent(page.body, finalUrl.toString(), $);
  const meta = extractMeta($);
  const headings = extractHeadings($);
  const jsonLd = extractJsonLd($);

  const checks: CheckResult[] = [
    ...(await checkCrawlers(finalUrl, $, page.headers)),
    ...checkStructuredData($),
    ...checkMeta($),
    ...checkHeadings($),
    ...checkContent(contentInfo),
  ];

  const categories = buildCategories(checks);

  return {
    page: {
      url: url.toString(),
      finalUrl: finalUrl.toString(),
      status: page.status,
      title: meta.title,
      description: meta.description,
      lang: meta.lang,
      mainText: contentInfo.mainText,
      mainTextLength: contentInfo.mainTextLength,
      rawTextLength: contentInfo.rawTextLength,
      jsonLdTypes: jsonLd.types,
      h1Count: headings.counts[1],
      fetchedAt: new Date().toISOString(),
    },
    overall: overallScore(categories),
    categories,
    notes,
  };
}
