import * as cheerio from "cheerio";
import { checkContent, extractContent } from "./content";
import {
  assertPublicHost,
  FetchError,
  fetchText,
  normalizeUrl,
  type FetchedText,
} from "./fetch";
import { checkHeadings, extractHeadings } from "./headings";
import { checkStructuredData, extractJsonLd } from "./jsonld";
import { checkMeta, extractMeta } from "./meta";
import { checkCrawlers, fetchSiteFiles, type SiteFiles } from "./robots";
import { buildCategories, overallScore } from "./scoring";
import type { AnalysisResult, CheckResult } from "./types";

export { FetchError, type FetchedText } from "./fetch";
export { fetchSiteFiles, type SiteFiles } from "./robots";
export * from "./types";

export interface AnalyzeOptions {
  /**
   * robots.txt / llms.txt の取得結果。サイト診断で複数ページを回すとき、
   * オリジン共通のファイルを毎ページ取り直さないために渡す。
   */
  siteFiles?: SiteFiles;
}

export interface AnalyzeFetchedOptions {
  /**
   * ユーザーが入力した（またはクロールで取りに行った）URL。
   * リダイレクトされた場合も、結果の `page.url` にはこちらを残す。既定は finalUrl。
   */
  requestedUrl?: string;
}

/**
 * 取得結果が診断できる HTML ページか確かめる。ダメなら FetchError を投げる。
 * analyze() とサイト診断（クローラ）で同じ判定を使うためにここに置く。
 */
export function assertHtmlPage(page: FetchedText): void {
  if (page.status === 0) {
    throw new FetchError("ページに接続できませんでした", "network");
  }
  if (!page.ok) {
    throw new FetchError(`ページの取得に失敗しました（HTTP ${page.status}）`, "network");
  }
  if (!page.contentType.includes("html") && !/<html[\s>]/i.test(page.body.slice(0, 2000))) {
    throw new FetchError("HTML ページではないため診断できません", "invalid_url");
  }
}

/**
 * 取得済みの HTML に対してルールベースの AIO 診断を実行する（ネットワークに出ない）。
 *
 * サイト診断ではクローラが取得したページをそのまま渡すので、同じページを
 * 二度取得しない。`siteFiles` はオリジン共通の robots.txt / llms.txt の情報。
 */
export function analyzeFetched(
  page: FetchedText,
  siteFiles: SiteFiles,
  options: AnalyzeFetchedOptions = {},
): AnalysisResult {
  assertHtmlPage(page);

  const finalUrl = new URL(page.finalUrl);
  const requestedUrl = options.requestedUrl ?? finalUrl.toString();
  const $ = cheerio.load(page.body);
  const notes: string[] = [];

  let requestedOrigin: string | null = null;
  try {
    requestedOrigin = new URL(requestedUrl).origin;
  } catch {
    requestedOrigin = null;
  }
  if (requestedOrigin && finalUrl.origin !== requestedOrigin) {
    notes.push(`リダイレクト先 ${finalUrl.toString()} を診断しました`);
  }

  const contentInfo = extractContent(page.body, finalUrl.toString(), $);
  const meta = extractMeta($);
  const headings = extractHeadings($);
  const jsonLd = extractJsonLd($);

  const checks: CheckResult[] = [
    ...checkCrawlers(finalUrl, $, page.headers, siteFiles),
    ...checkStructuredData($),
    ...checkMeta($),
    ...checkHeadings($),
    ...checkContent(contentInfo),
  ];

  const categories = buildCategories(checks);

  return {
    page: {
      url: requestedUrl,
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

/**
 * URL を受け取り、ルールベースの AIO 診断を実行する。
 * AI は一切使わない（API 費用ゼロ）。
 *
 * 診断対象は渡された URL の 1 ページだけで、サイト全体ではない。
 * 同じサイトでもページが違えば HTML が違うため、構造化データ・メタ情報・
 * 見出し・コンテンツのスコアはページごとに変わる。サイト全体を見るには
 * `analyzeSite()` を使う。
 */
export async function analyze(
  input: string,
  options: AnalyzeOptions = {},
): Promise<AnalysisResult> {
  const url = normalizeUrl(input);
  await assertPublicHost(url);

  const page = await fetchText(url.toString());
  assertHtmlPage(page);

  const siteFiles = options.siteFiles ?? (await fetchSiteFiles(new URL(page.finalUrl).origin));
  return analyzeFetched(page, siteFiles, { requestedUrl: url.toString() });
}
