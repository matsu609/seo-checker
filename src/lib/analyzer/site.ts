import { analyze } from "./index";
import { assertPublicHost, FetchError, fetchText, normalizeUrl } from "./fetch";
import { fetchSiteFiles, type SiteFiles } from "./robots";
import {
  CATEGORY_LABELS,
  type AnalysisResult,
  type CategoryId,
  type CheckStatus,
  type SiteAnalysisResult,
  type SiteCategoryScore,
  type SiteCheckSummary,
  type SitePageFailure,
  type SitePageResult,
} from "./types";

/** 既定で診断するページ数。対象サイトへの負荷とレスポンス時間の折り合い */
export const DEFAULT_MAX_PAGES = 5;
export const MAX_PAGES_LIMIT = 10;
/** 同時に何ページ取得するか。相手サーバーに優しく */
const CONCURRENCY = 2;

/** 明らかに HTML ではない URL を弾く */
const NON_HTML_EXT =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|css|js|mjs|json|xml|zip|gz|mp[34]|mov|webm|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i;

/**
 * URL を「同じページ」と見なす形に揃える。
 * 末尾スラッシュとクエリ・フラグメントの差で同じページを二重に診断しないため。
 */
export function canonicalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(input, base);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.hash = "";
  url.search = "";
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }
  return url.toString();
}

/** sitemap.xml / sitemapindex から <loc> を取り出す */
export function extractSitemapLocs(xml: string): string[] {
  const locs: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
    locs.push(decodeXmlEntities(m[1]));
  }
  return locs;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** <loc> がサイトマップ索引を指しているか（1 段だけ辿る） */
function isSitemapUrl(url: string): boolean {
  return /sitemap[^/]*\.xml(\.gz)?$/i.test(url);
}

/**
 * 同一オリジンの HTML ページ URL を集める。
 * robots.txt の Sitemap → sitemap.xml → 見つからなければトップページの内部リンク。
 */
export async function discoverUrls(
  origin: string,
  entryUrl: string,
  files: SiteFiles,
  limit: number,
): Promise<{ urls: string[]; discovery: SiteAnalysisResult["discovery"] }> {
  const sameOrigin = (u: string) => {
    try {
      return new URL(u).origin === origin;
    } catch {
      return false;
    }
  };

  // --- 1. sitemap ------------------------------------------------------------
  const sitemapCandidates = files.sitemaps.length > 0 ? files.sitemaps : [`${origin}/sitemap.xml`];
  const fromSitemap: string[] = [];
  for (const sitemapUrl of sitemapCandidates.slice(0, 3)) {
    if (!sameOrigin(sitemapUrl)) continue;
    const res = await fetchText(sitemapUrl, { timeoutMs: 8000 });
    if (!res.ok || !res.body.includes("<loc")) continue;
    const locs = extractSitemapLocs(res.body);
    // サイトマップ索引なら 1 段だけ中を見る
    const nested = locs.filter(isSitemapUrl).slice(0, 2);
    if (nested.length > 0 && locs.every(isSitemapUrl)) {
      for (const child of nested) {
        if (!sameOrigin(child)) continue;
        const childRes = await fetchText(child, { timeoutMs: 8000 });
        if (childRes.ok) fromSitemap.push(...extractSitemapLocs(childRes.body));
      }
    } else {
      fromSitemap.push(...locs.filter((u) => !isSitemapUrl(u)));
    }
    if (fromSitemap.length > 0) break;
  }

  const usable = (list: string[]) =>
    dedupe(
      list
        .map((u) => canonicalizeUrl(u))
        .filter((u): u is string => Boolean(u) && sameOrigin(u!) && !NON_HTML_EXT.test(u!)),
    );

  const sitemapUrls = usable(fromSitemap);
  if (sitemapUrls.length > 0) {
    return { urls: pickPages(entryUrl, sitemapUrls, limit), discovery: "sitemap" };
  }

  // --- 2. トップページの内部リンク -------------------------------------------
  const home = await fetchText(origin + "/", { timeoutMs: 10_000 });
  if (home.ok && home.body) {
    const hrefs: string[] = [];
    for (const m of home.body.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
      const abs = canonicalizeUrl(m[1], home.finalUrl || origin);
      if (abs) hrefs.push(abs);
    }
    const linkUrls = usable(hrefs);
    if (linkUrls.length > 0) {
      return { urls: pickPages(entryUrl, linkUrls, limit), discovery: "links" };
    }
  }

  return { urls: [entryUrl], discovery: "entry-only" };
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}

/**
 * 入力 URL を必ず先頭に置き、残りは階層の浅い順に選ぶ。
 * 深い記事ページより、トップ・会社概要・サービスといった主要ページを見たいため。
 */
export function pickPages(entryUrl: string, candidates: string[], limit: number): string[] {
  const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;
  const rest = candidates
    .filter((u) => u !== entryUrl)
    .sort((a, b) => depth(a) - depth(b) || a.length - b.length);
  return [entryUrl, ...rest].slice(0, limit);
}

/** 配列を n 件ずつ並列に処理する */
async function mapWithConcurrency<T, R>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface AnalyzeSiteOptions {
  maxPages?: number;
}

/**
 * サイト単位の診断。複数ページを診断して集計する。
 *
 * サイト共通の項目（robots.txt / llms.txt）は 1 度だけ取得して全ページで共有し、
 * ページ固有の項目（構造化データ・メタ・見出し・コンテンツ）はページごとに評価して
 * 平均とばらつきを出す。「どのページが原因で点が下がっているか」が分かる。
 */
export async function analyzeSite(
  input: string,
  options: AnalyzeSiteOptions = {},
): Promise<SiteAnalysisResult> {
  const entry = normalizeUrl(input);
  await assertPublicHost(entry);

  const limit = Math.min(Math.max(options.maxPages ?? DEFAULT_MAX_PAGES, 1), MAX_PAGES_LIMIT);
  const origin = entry.origin;
  const entryUrl = canonicalizeUrl(entry.toString()) ?? entry.toString();

  const files = await fetchSiteFiles(origin);
  const { urls, discovery } = await discoverUrls(origin, entryUrl, files, limit);

  const notes: string[] = [];
  if (discovery === "entry-only") {
    notes.push(
      "sitemap.xml も内部リンクも見つからなかったため、入力された 1 ページだけを診断しました",
    );
  } else if (urls.length === 1) {
    notes.push("同一サイト内に他のページが見つからなかったため、1 ページだけを診断しました");
  }

  type Settled =
    | { ok: true; url: string; result: AnalysisResult }
    | { ok: false; url: string; message: string };

  const settled = await mapWithConcurrency<string, Settled>(urls, CONCURRENCY, async (url) => {
    try {
      return { ok: true, url, result: await analyze(url, { siteFiles: files }) };
    } catch (err) {
      const message =
        err instanceof FetchError ? err.message : "診断中に予期しないエラーが発生しました";
      return { ok: false, url, message };
    }
  });

  const pages: SitePageResult[] = [];
  const failures: SitePageFailure[] = [];
  const analyses: { url: string; result: AnalysisResult }[] = [];

  for (const item of settled) {
    if (!item.ok) {
      failures.push({ url: item.url, message: item.message });
      continue;
    }
    analyses.push({ url: item.url, result: item.result });
    pages.push({
      url: item.result.page.finalUrl,
      overall: item.result.overall,
      scores: Object.fromEntries(
        item.result.categories.map((c) => [c.id, c.score]),
      ) as Record<CategoryId, number>,
      page: item.result.page,
    });
  }

  if (pages.length === 0) {
    throw new FetchError("サイト内のどのページも診断できませんでした", "network");
  }

  return {
    entryUrl: entry.toString(),
    origin,
    pages,
    failures,
    overall: average(pages.map((p) => p.overall)),
    categories: summarizeCategories(pages),
    checks: summarizeChecks(analyses),
    discovery,
    notes,
    fetchedAt: new Date().toISOString(),
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

export function summarizeCategories(pages: SitePageResult[]): SiteCategoryScore[] {
  return (Object.keys(CATEGORY_LABELS) as CategoryId[]).map((id) => {
    const scored = pages.map((p) => ({ url: p.url, score: p.scores[id] ?? 0 }));
    const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
    return {
      id,
      label: CATEGORY_LABELS[id],
      score: average(scored.map((s) => s.score)),
      min: Math.min(...scored.map((s) => s.score)),
      max: Math.max(...scored.map((s) => s.score)),
      worstUrl: worst.url,
    };
  });
}

/**
 * 項目ごとにページ横断で集計する。
 * 全ページ同じ状態なら "uniform"（テンプレート側の問題）、
 * 混在していれば "mixed"（そのページだけの問題）。
 */
export function summarizeChecks(
  analyses: { url: string; result: AnalysisResult }[],
): SiteCheckSummary[] {
  const map = new Map<string, SiteCheckSummary>();

  for (const { result } of analyses) {
    const url = result.page.finalUrl;
    for (const category of result.categories) {
      for (const c of category.checks) {
        let entry = map.get(c.id);
        if (!entry) {
          entry = {
            id: c.id,
            category: c.category,
            label: c.label,
            advice: c.advice,
            counts: { pass: 0, warn: 0, fail: 0, info: 0 },
            spread: "uniform",
            affected: [],
          };
          map.set(c.id, entry);
        }
        entry.counts[c.status] += 1;
        if (c.advice && !entry.advice) entry.advice = c.advice;
        if (c.status !== "pass") {
          entry.label = c.label; // 問題があるときの文言を代表にする
          entry.affected.push({ url, status: c.status, evidence: c.evidence });
        }
      }
    }
  }

  const summaries = [...map.values()];
  for (const s of summaries) {
    const seen = (["pass", "warn", "fail", "info"] as CheckStatus[]).filter(
      (k) => s.counts[k] > 0,
    );
    s.spread = seen.length > 1 ? "mixed" : "uniform";
  }

  // ばらついている項目 → 全ページで問題がある項目 → 問題なしの順に並べる
  const rank = (s: SiteCheckSummary) => {
    if (s.spread === "mixed") return 0;
    if (s.counts.fail > 0 || s.counts.warn > 0) return 1;
    return 2;
  };
  return summaries.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
}
