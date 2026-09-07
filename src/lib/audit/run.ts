/**
 * A1 サイト診断の実行（サーバー専用）。
 *
 * クロールは共有の crawlSite（sitemap 展開 + 内部リンク BFS）をそのまま使い、
 * ここでやるのは「解析 → 補足の取得 → ルール適用 → 集計」だけ。
 * 補足の取得（リンク切れの確認・リダイレクトのホップ数・取得時間の実測）は
 * 件数に上限を設けてある（config.ts）。ネットワークに出る経路は
 * すべて fetchText（= assertPublicHost 経由）に限る。
 */
import robotsParser from "robots-parser";
import { assertHtmlPage } from "@/lib/analyzer";
import { FetchError, assertPublicHost, fetchText, normalizeUrl, type FetchedText } from "@/lib/analyzer/fetch";
import { fetchSiteFiles, type SiteFiles } from "@/lib/analyzer/robots";
import { crawlSite, resolveMaxPages } from "@/lib/crawl/crawler";
import { discoverSitemapUrls } from "@/lib/crawl/discover";
import { canonicalizeUrl } from "@/lib/crawl/url";
import {
  MAX_PROBE_URLS,
  MAX_TIMED_PAGES,
  VERIFY_CONCURRENCY,
  VERIFY_TIMEOUT_MS,
} from "./config";
import { parseAuditPage } from "./parse";
import { runCrossRules, runPageRules, resolveCanonical } from "./rules";
import { buildRuleSummary } from "./summary";
import type {
  AuditContext,
  AuditProgress,
  AuditPage,
  AuditPageRow,
  AuditPhase,
  AuditResult,
  Issue,
  ProbeResult,
  Severity,
} from "./types";
import { AUDIT_CATEGORIES } from "./types";

/** ホップ数を調べるためのリダイレクト検証は件数を絞る（追加リクエストになるため） */
const MAX_CHAIN_PROBES = 10;
/** 検証だけなら本文は要らないので小さく打ち切る */
const PROBE_MAX_BYTES = 256 * 1024;

export type { AuditProgress };

export interface RunAuditOptions {
  maxPages?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AuditProgress) => void;
}

export async function runAudit(input: string, options: RunAuditOptions = {}): Promise<AuditResult> {
  const started = Date.now();
  const entry = normalizeUrl(input);
  await assertPublicHost(entry);

  const emit = (phase: AuditPhase, extra: Partial<AuditProgress> = {}) => {
    options.onProgress?.({
      phase,
      fetched: 0,
      queued: 0,
      discovered: 0,
      analyzed: 0,
      failed: 0,
      elapsedMs: Date.now() - started,
      ...extra,
    });
  };

  // --- 入力ページ（取得時間も測る。クロールにはこの結果を渡して二度取得しない） ---
  emit("discover");
  const entryStarted = Date.now();
  const entryPage = await fetchText(entry.toString());
  const entryLoadMs = Date.now() - entryStarted;
  assertHtmlPage(entryPage);

  const origin = new URL(entryPage.finalUrl).origin;
  const entryUrl = canonicalizeUrl(entry.toString()) ?? entry.toString();
  const siteFiles = await fetchSiteFiles(origin);

  // --- サイトマップの URL 一覧（クロールとの差分に使う） ---------------------
  // crawlSite も内部で同じ展開をするが、URL の一覧は返さないので別に集める。
  const discovery = await discoverSitemapUrls(origin, siteFiles, { maxUrls: 5_000 });

  // --- クロール ---------------------------------------------------------------
  const parsed = new Map<string, AuditPage>();
  const signatures: Record<string, number[]> = {};
  const robots = siteFiles.robotsTxt ? robotsParser(`${origin}/robots.txt`, siteFiles.robotsTxt) : null;

  const maxPages = resolveMaxPages(options.maxPages);
  const crawl = await crawlSite({
    entryUrl,
    origin,
    siteFiles,
    entryPage,
    maxPages,
    signal: options.signal,
    onProgress: (progress) =>
      emit(progress.phase === "discover" ? "discover" : "crawl", {
        fetched: progress.fetched,
        queued: progress.queued,
        discovered: progress.discovered,
        analyzed: parsed.size,
        failed: progress.failed,
        url: progress.url,
      }),
    visit: (page, url) => {
      const requestedUrl = canonicalizeUrl(url) ?? url;
      const result = parseAuditPage(page, {
        requestedUrl,
        robotsAllowed: robots ? robots.isAllowed(page.finalUrl, "Googlebot") !== false : true,
        loadMs: requestedUrl === entryUrl ? entryLoadMs : null,
      });
      parsed.set(result.page.url, result.page);
      signatures[result.page.url] = result.signature;
    },
  });

  const pages = [...parsed.values()];

  // --- 内部リンクの深さと入次数 ------------------------------------------------
  applyDepths(pages, entryUrl);

  // --- 補足の取得（リンク切れ・canonical 先・サイト共通ファイル） --------------
  emit("verify", { fetched: crawl.fetched, discovered: crawl.discovered, analyzed: pages.length });
  const probes: Record<string, ProbeResult> = {};
  const [faviconExists, httpServed] = await Promise.all([
    probeExists(`${origin}/favicon.ico`),
    probeHttpVariant(origin),
  ]);

  const candidates = collectProbeTargets(pages, crawl.failures.map((f) => f.url), discovery.urls, origin);
  await runPool(candidates.slice(0, MAX_PROBE_URLS), VERIFY_CONCURRENCY, async (url) => {
    const probe = await probeUrl(url);
    if (probe) probes[url] = probe;
  }, options.signal);

  // リダイレクトしたページのホップ数（先頭 MAX_CHAIN_PROBES 件だけ確かめる）
  const redirected = pages.filter((p) => p.finalUrl !== p.url).slice(0, MAX_CHAIN_PROBES);
  await runPool(redirected, VERIFY_CONCURRENCY, async (page) => {
    const hops = await detectRedirectHops(page.url, page.finalUrl);
    probes[page.url] = { status: page.status, finalUrl: page.finalUrl, hops };
  }, options.signal);

  // --- 取得時間の実測（先頭 MAX_TIMED_PAGES ページ） ---------------------------
  const timingTargets = pages
    .filter((p) => p.loadMs === null)
    .sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99))
    .slice(0, Math.max(0, MAX_TIMED_PAGES - 1));
  await runPool(timingTargets, VERIFY_CONCURRENCY, async (page) => {
    const ms = await measureLoad(page.finalUrl);
    if (ms !== null) page.loadMs = ms;
  }, options.signal);

  // --- ルールの適用 ------------------------------------------------------------
  emit("analyze", { fetched: crawl.fetched, discovered: crawl.discovered, analyzed: pages.length });
  const context: AuditContext = {
    origin,
    entryUrl,
    siteFiles,
    robotsExists: siteFiles.robotsTxt !== null,
    sitemapUrls: discovery.urls,
    sitemapFound: discovery.sitemapFiles > 0,
    faviconExists,
    httpServed,
    probes,
    signatures,
  };

  const issues: Issue[] = [];
  for (const page of pages) issues.push(...runPageRules(page, context));
  issues.push(...runCrossRules(pages, context));
  if (httpServed) {
    issues.push({
      ruleId: "HTTP_PAGE",
      category: "セキュリティ",
      severity: "error",
      url: `http://${new URL(origin).host}/`,
      detail: "http:// のトップページが https へ転送されず、そのまま表示されます",
      suggestion:
        "http へのアクセスをすべて https へ 301 リダイレクトしてください。両方が見えていると、同じ内容が 2 つの URL に分かれて評価されます。",
    });
  }

  return buildResult({
    startUrl: entry.toString(),
    origin,
    crawledAt: new Date().toISOString(),
    pages,
    issues,
    crawlStats: {
      discovered: crawl.discovered,
      fetched: crawl.fetched,
      analyzed: pages.length,
      failed: crawl.failures.length,
      skipped: crawl.skipped,
      durationMs: Date.now() - started,
      maxPages,
      truncated: crawl.truncated,
      sitemapCount: crawl.sitemapCount,
      linkCount: crawl.linkCount,
      probed: Object.keys(probes).length,
      timed: pages.filter((p) => p.loadMs !== null).length,
    },
    failures: crawl.failures,
    notes: [...crawl.notes, ...discovery.notes.filter((n) => !crawl.notes.includes(n))],
  });
}

/* ───────────── 集計 ───────────── */

interface BuildResultInput {
  startUrl: string;
  origin: string;
  crawledAt: string;
  pages: AuditPage[];
  issues: Issue[];
  crawlStats: AuditResult["crawl"];
  failures: AuditResult["failures"];
  notes: string[];
}

/** ルールの結果を画面が使う形にまとめる（純関数。テストから直接呼べる） */
export function buildResult(input: BuildResultInput): AuditResult {
  const { pages, issues } = input;
  const perPage = new Map<string, number>();
  for (const i of issues) perPage.set(i.url, (perPage.get(i.url) ?? 0) + 1);

  const inlinks = countInlinks(pages);
  const rows: AuditPageRow[] = pages.map((page) => ({
    url: page.url,
    finalUrl: page.finalUrl,
    status: page.status,
    depth: page.depth,
    title: page.title,
    description: page.description,
    h1Count: page.h1.length,
    mainTextLength: page.mainTextLength,
    textRatio: Math.round(page.textRatio * 1000) / 1000,
    bytes: page.bytes,
    loadMs: page.loadMs,
    internalLinks: page.internalLinks.length,
    inlinks: inlinks.get(page.url) ?? 0,
    canonical: resolveCanonical(page),
    noindex: page.metaRobots.includes("noindex") || page.xRobotsTag.includes("noindex"),
    issues: perPage.get(page.url) ?? 0,
  }));

  const byCategory = AUDIT_CATEGORIES.map((category) => ({
    category,
    count: issues.filter((i) => i.category === category).length,
  }));

  const bySeverity: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const i of issues) bySeverity[i.severity] += 1;

  const ruleMap = new Map<string, { ruleId: string; category: Issue["category"]; severity: Severity; count: number }>();
  for (const i of issues) {
    const found = ruleMap.get(i.ruleId);
    if (found) found.count += 1;
    else ruleMap.set(i.ruleId, { ruleId: i.ruleId, category: i.category, severity: i.severity, count: 1 });
  }
  const byRule = [...ruleMap.values()].sort((a, b) => b.count - a.count || a.ruleId.localeCompare(b.ruleId));

  const result: AuditResult = {
    startUrl: input.startUrl,
    origin: input.origin,
    crawledAt: input.crawledAt,
    crawl: input.crawlStats,
    pages: rows,
    issues,
    byCategory,
    bySeverity,
    byRule,
    failures: input.failures,
    notes: input.notes,
  };
  result.summary = buildRuleSummary(result);
  return result;
}

/** ページごとの入次数（内部リンクの本数） */
export function countInlinks(pages: readonly AuditPage[]): Map<string, number> {
  const inlinks = new Map<string, number>();
  for (const page of pages) inlinks.set(page.url, 0);
  for (const page of pages) {
    for (const link of page.internalLinks) {
      if (link === page.url) continue;
      if (inlinks.has(link)) inlinks.set(link, (inlinks.get(link) ?? 0) + 1);
    }
  }
  return inlinks;
}

/**
 * 入力 URL からの内部リンクの最短ホップ数を各ページに入れる（幅優先）。
 * リンクからたどり着けないページ（サイトマップだけにあるページ）は null のまま。
 */
export function applyDepths(pages: readonly AuditPage[], entryUrl: string): void {
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const start = byUrl.get(entryUrl) ?? pages[0];
  if (!start) return;
  start.depth = 0;
  const queue: AuditPage[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const next = (current.depth ?? 0) + 1;
    for (const link of current.internalLinks) {
      const target = byUrl.get(link);
      if (!target || target.depth !== null) continue;
      target.depth = next;
      queue.push(target);
    }
  }
}

/**
 * 検証のために取得する URL を集める（クロール済みは除く）。
 *
 * 対象は監査中のオリジンに限る。canonical は第三者のページに書かれた値を
 * そのまま解決したものなので、`<link rel="canonical" href="http://169.254.169.254/...">`
 * のような指定を素通しすると内部ホストの到達性を調べる踏み台になる
 * （外部オリジンの canonical 先はこの監査では取得する必要もない）。
 */
export function collectProbeTargets(
  pages: readonly AuditPage[],
  failedUrls: readonly string[],
  sitemapUrls: readonly string[],
  origin: string,
): string[] {
  const crawled = new Set(pages.map((p) => p.url));
  const targets = new Set<string>();
  const add = (url: string | null) => {
    if (!url || crawled.has(url) || targets.has(url)) return;
    if (!url.startsWith("http")) return;
    try {
      if (new URL(url).origin !== origin) return;
    } catch {
      return;
    }
    targets.add(url);
  };
  // 1. リンク切れの確認（クロールされなかった内部リンク先）
  for (const page of pages) for (const link of page.internalLinks) add(link);
  // 2. canonical の指す先
  for (const page of pages) add(resolveCanonical(page));
  // 3. 取得に失敗した URL（ステータスを確かめる）
  for (const url of failedUrls) add(canonicalizeUrl(url));
  // 4. サイトマップに載っているのにクロールされなかった URL
  for (const url of sitemapUrls) add(url);
  return [...targets];
}

/* ───────────── ネットワーク（すべて fetchText 経由） ───────────── */

async function probeUrl(url: string): Promise<ProbeResult | null> {
  try {
    const res = await fetchText(url, { timeoutMs: VERIFY_TIMEOUT_MS, maxBytes: PROBE_MAX_BYTES });
    const finalUrl = canonicalizeUrl(res.finalUrl) ?? res.finalUrl;
    return { status: res.status, finalUrl, hops: finalUrl === url ? 0 : 1 };
  } catch (err) {
    // 内部アドレスへの転送などは結果に出さない（到達性を調べる材料にしない）
    if (err instanceof FetchError && err.code === "blocked_host") return null;
    return null;
  }
}

async function probeExists(url: string): Promise<boolean> {
  try {
    const res = await fetchText(url, { timeoutMs: VERIFY_TIMEOUT_MS, maxBytes: PROBE_MAX_BYTES });
    return res.ok;
  } catch {
    return false;
  }
}

/** http:// のトップが https へ転送されずに 200 を返すか */
async function probeHttpVariant(origin: string): Promise<boolean> {
  let httpUrl: string;
  try {
    const url = new URL(origin);
    if (url.protocol === "http:") return false; // 入力自体が http なら別ルールで拾う
    url.protocol = "http:";
    url.port = "";
    httpUrl = url.toString();
  } catch {
    return false;
  }
  try {
    const res = await fetchText(httpUrl, { timeoutMs: VERIFY_TIMEOUT_MS, maxBytes: PROBE_MAX_BYTES });
    return res.ok && res.finalUrl.startsWith("http://");
  } catch {
    return false;
  }
}

/** 取得時間（ミリ秒）。失敗したら null */
async function measureLoad(url: string): Promise<number | null> {
  const started = Date.now();
  try {
    const res = await fetchText(url, { timeoutMs: VERIFY_TIMEOUT_MS });
    if (!res.ok) return null;
    return Date.now() - started;
  } catch {
    return null;
  }
}

/**
 * リダイレクトのホップ数を推定する。
 *
 * fetchText は転送を最後まで追ってしまい途中の URL を返さないので、
 * 「よくある中間 URL」（スキームだけ揃えた URL / ホストだけ揃えた URL）を
 * 1 つずつ試し、そこからも同じ最終 URL に着くなら 2 ホップ以上と判断する。
 * http → https → 正規 URL のような実際に多い連鎖はこれで捕まえられる。
 */
export function redirectIntermediates(from: string, to: string): string[] {
  let a: URL;
  let b: URL;
  try {
    a = new URL(from);
    b = new URL(to);
  } catch {
    return [];
  }
  const fromPath = `${a.pathname}${a.search}`;
  const toPath = `${b.pathname}${b.search}`;
  if (a.origin === b.origin || fromPath === toPath) return [];
  const candidates = [new URL(fromPath, b.origin).toString(), new URL(toPath, a.origin).toString()];
  return candidates.filter((c) => c !== from && c !== to);
}

async function detectRedirectHops(from: string, to: string): Promise<number> {
  for (const candidate of redirectIntermediates(from, to)) {
    try {
      const res = await fetchText(candidate, { timeoutMs: VERIFY_TIMEOUT_MS, maxBytes: PROBE_MAX_BYTES });
      if (!res.ok) continue;
      const finalUrl = canonicalizeUrl(res.finalUrl) ?? res.finalUrl;
      if (finalUrl === to) return 2;
    } catch {
      /* 中間 URL が取れなくても、1 ホップとして扱う */
    }
  }
  return 1;
}

/** 同時実行数を絞って順に処理する（crawl/pool.ts は crawlSite 専用なので簡易版） */
async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      if (signal?.aborted) return;
      const current = index;
      index += 1;
      if (current >= items.length) return;
      await work(items[current]);
    }
  });
  await Promise.all(workers);
}

export type { FetchedText, SiteFiles };
