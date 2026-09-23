/**
 * サイトの確認を 1 回行う（サーバー専用）。robots.txt → サイトマップ → 主要ページ → トップのリンク → SSL。
 *
 * 取得はすべて src/lib/analyzer/fetch.ts の fetchText（内部アドレスへの踏み台にならない検査つき）。
 * 自社サイトへのアクセスなので外部 API の費用は出ない。
 */
import robotsParser from "robots-parser";
import { fetchText, looksLikeHtml, normalizeUrl } from "@/lib/analyzer/fetch";
import { runPool } from "@/lib/async/pool";
import { incidentsFromSnapshot, internalLinksFrom, pageCheckFailed, pageCheckFromFetched } from "./checks";
import { checkCertificate } from "./ssl";
import type { LinkCheck, MonitorSnapshot, PageCheck } from "./types";

export const MAX_KEY_PAGES = 10;
export const MAX_LINKS = 30;
const PAGE_TIMEOUT_MS = 15_000;
const LINK_TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;

export interface CheckSiteOptions {
  /** トップページ以外に見る主要ページ */
  keyPages?: readonly string[];
  now?: Date;
  signal?: AbortSignal;
  /** これを過ぎたらリンクの確認を省く */
  deadline?: number;
  fetchImpl?: typeof fetchText;
  sslImpl?: typeof checkCertificate;
}

export async function checkSite(siteUrl: string, options: CheckSiteOptions = {}): Promise<MonitorSnapshot> {
  const fetchPage = options.fetchImpl ?? fetchText;
  const ssl = options.sslImpl ?? checkCertificate;
  const now = options.now ?? new Date();
  const entry = normalizeUrl(siteUrl);
  const origin = entry.origin;
  const home = entry.toString();

  // robots.txt
  let robotsTxt: string | null = null;
  try {
    const r = await fetchPage(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 200_000 });
    robotsTxt = r.ok && !looksLikeHtml(r) ? r.body : null;
  } catch {
    robotsTxt = null;
  }
  const robots = robotsTxt ? robotsParser(`${origin}/robots.txt`, robotsTxt) : null;
  const allowed = (url: string) => (robots ? robots.isAllowed(url, "Googlebot") !== false : true);
  const blocksAll = robots ? robots.isAllowed(`${origin}/`, "Googlebot") === false : false;

  // サイトマップ（robots.txt に書いてあればそれ、無ければ /sitemap.xml）
  const sitemapUrl = robots?.getSitemaps()?.[0] ?? `${origin}/sitemap.xml`;
  let sitemap: MonitorSnapshot["sitemap"] = { url: sitemapUrl, ok: false, status: null };
  try {
    const r = await fetchPage(sitemapUrl, { timeoutMs: 8000, maxBytes: 200_000 });
    sitemap = { url: sitemapUrl, ok: r.ok && !looksLikeHtml(r) && /<(urlset|sitemapindex)/i.test(r.body.slice(0, 2000)), status: r.status };
  } catch {
    sitemap = { url: sitemapUrl, ok: false, status: null };
  }

  // 主要ページ
  const targets = [home, ...(options.keyPages ?? []).filter((u) => u !== home).slice(0, MAX_KEY_PAGES)];
  let homeHtml = "";
  const pages: PageCheck[] = await runPool(targets, CONCURRENCY, async (url, i) => {
    const started = Date.now();
    try {
      const r = await fetchPage(url, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: 1_500_000 });
      const ms = Date.now() - started;
      if (i === 0) homeHtml = r.ok ? r.body : "";
      return pageCheckFromFetched(url, i === 0, r, ms, allowed(url));
    } catch (err) {
      return pageCheckFailed(url, i === 0, err instanceof Error ? err.message : "取得に失敗しました", allowed(url));
    }
  });

  // トップのリンク（時間があるときだけ）
  let links: MonitorSnapshot["links"] = { checked: 0, broken: [] };
  const linkUrls = homeHtml ? internalLinksFrom(home, homeHtml, MAX_LINKS).filter((u) => !targets.includes(u)) : [];
  if (linkUrls.length > 0 && (!options.deadline || Date.now() < options.deadline - 20_000)) {
    const results: LinkCheck[] = await runPool(linkUrls, CONCURRENCY, async (url) => {
      try {
        const r = await fetchPage(url, { timeoutMs: LINK_TIMEOUT_MS, maxBytes: 20_000 });
        return { url, status: r.status, error: null };
      } catch (err) {
        return { url, status: null, error: err instanceof Error ? err.message : "取得に失敗しました" };
      }
    });
    links = { checked: results.length, broken: results.filter((r) => r.status === null || r.status >= 400) };
  }

  const sslResult = entry.protocol === "https:" ? await ssl(entry.hostname, now) : null;

  const base = { origin, checkedAt: now.toISOString(), pages, links, robots: { fetched: robotsTxt !== null, blocksAll }, sitemap, ssl: sslResult };
  return { ...base, incidents: incidentsFromSnapshot(base) };
}
