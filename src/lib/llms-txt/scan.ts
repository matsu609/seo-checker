/**
 * llms.txt の候補ページを集める（サーバー専用）。
 *
 * 共有の crawlSite（sitemap 展開 + 内部リンク BFS）でページを取得し、
 * title と meta description をそのまま候補の初期値にする。
 * 対象パス / 除外パスの判定は純関数（matchesPath）に分けてある。
 */
import * as cheerio from "cheerio";
import { assertHtmlPage } from "@/lib/analyzer";
import { assertPublicHost, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import { extractMeta } from "@/lib/analyzer/meta";
import { fetchSiteFiles } from "@/lib/analyzer/robots";
import { crawlSite, resolveMaxPages } from "@/lib/crawl/crawler";
import { canonicalizeUrl, pathDepth } from "@/lib/crawl/url";
import type { ScanCandidate, ScanResult } from "./types";

/** 候補として返す最大件数（画面で選ばせる前提なので多すぎても困る） */
export const MAX_CANDIDATES = 100;
/** 既定のクロール上限 */
export const DEFAULT_SCAN_LIMIT = 30;

/** 改行区切りの入力をパターンの配列にする */
export function parsePatterns(input: string): string[] {
  return input
    .split(/[\r\n,]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * パスがパターンに一致するか。
 * `*` を任意の文字列として扱い、それ以外は前方一致で判定する
 * （/blog は /blog/post-1 にも一致する）。
 */
export function matchesPath(path: string, pattern: string): boolean {
  const normalized = pattern.startsWith("/") ? pattern : `/${pattern}`;
  if (!normalized.includes("*")) return path === normalized || path.startsWith(normalized.replace(/\/$/, "") + "/") || path === normalized.replace(/\/$/, "");
  // 正規表現の特殊文字を無効化してから * だけを .* に戻す
  const escaped = normalized.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`).test(path);
}

/** 対象パス（空なら全部）と除外パスで絞る */
export function shouldInclude(url: string, include: string[], exclude: string[]): boolean {
  let path: string;
  try {
    path = new URL(url).pathname || "/";
  } catch {
    return false;
  }
  if (exclude.some((pattern) => matchesPath(path, pattern))) return false;
  if (include.length === 0) return true;
  return include.some((pattern) => matchesPath(path, pattern));
}

export interface ScanOptions {
  includePaths?: string;
  excludePaths?: string;
  limit?: number;
  signal?: AbortSignal;
}

/** サイトを走査して候補ページを返す */
export async function scanSite(input: string, options: ScanOptions = {}): Promise<ScanResult> {
  const entry = normalizeUrl(input);
  await assertPublicHost(entry);

  const entryPage = await fetchText(entry.toString());
  assertHtmlPage(entryPage);

  const origin = new URL(entryPage.finalUrl).origin;
  const entryUrl = canonicalizeUrl(entry.toString()) ?? entry.toString();
  const siteFiles = await fetchSiteFiles(origin);

  const include = parsePatterns(options.includePaths ?? "");
  const exclude = parsePatterns(options.excludePaths ?? "");
  const maxPages = resolveMaxPages(options.limit ?? DEFAULT_SCAN_LIMIT);

  const candidates: ScanCandidate[] = [];

  const crawl = await crawlSite({
    entryUrl,
    origin,
    siteFiles,
    entryPage,
    maxPages,
    signal: options.signal,
    visit: (page, url) => {
      const requested = canonicalizeUrl(url) ?? url;
      if (!shouldInclude(requested, include, exclude)) return;
      const $ = cheerio.load(page.body);
      const meta = extractMeta($);
      candidates.push({
        url: requested,
        title: meta.title ?? h1Of($) ?? requested,
        description: meta.description ?? "",
        depth: pathDepth(requested),
      });
    },
  });

  // 入力 URL を先頭に、あとは階層の浅い順（トップ → 主要ページ → 記事）
  candidates.sort((a, b) => {
    if (a.url === entryUrl) return -1;
    if (b.url === entryUrl) return 1;
    return a.depth - b.depth || a.url.localeCompare(b.url);
  });

  const entryTitle = candidates.find((c) => c.url === entryUrl);
  const notes = [...crawl.notes];
  if (candidates.length === 0) {
    notes.push("条件に一致するページが見つかりませんでした。対象パス・除外パスを見直してください。");
  }
  if (crawl.truncated) {
    notes.push(
      crawl.truncated.reason === "max-pages"
        ? `上限の ${crawl.truncated.limit} ページに達したため、途中で打ち切りました。`
        : "時間の上限に達したため、途中で打ち切りました。",
    );
  }

  return {
    origin,
    siteName: siteNameFrom(entryTitle?.title ?? "", origin),
    siteSummary: entryTitle?.description ?? "",
    candidates: candidates.slice(0, MAX_CANDIDATES),
    sitemaps: siteFiles.sitemaps,
    existingLlmsTxt: siteFiles.llmsTxt.present,
    crawledAt: new Date().toISOString(),
    notes,
  };
}

function h1Of($: cheerio.CheerioAPI): string | null {
  const text = $("h1").first().text().replace(/\s+/g, " ").trim();
  return text || null;
}

/**
 * トップページの title からサイト名を推測する。
 *
 * 下層ページは「ページ名｜サイト名」だが、**トップページ**は
 * 「サイト名｜キャッチコピー」の形が圧倒的に多い。ここに渡すのは
 * 入力 URL（＝トップページ）の title なので、区切り文字の前を採る。
 * 長すぎて名前らしくないときは推測せずホスト名にする（画面で直せる）。
 */
export function siteNameFrom(title: string, origin: string): string {
  const first = title
    .split(/[|｜\-–—]/)
    .map((p) => p.trim())
    .find((p) => p.length > 0);
  if (first && first.length <= 30) return first;
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
