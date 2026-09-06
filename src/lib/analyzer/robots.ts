import robotsParser from "robots-parser";
import * as cheerio from "cheerio";
import { check, optionalCheck } from "./check";
import { fetchText } from "./fetch";
import type { CheckResult } from "./types";

/** 主要な AI クローラの User-agent。robots.txt でこれらが拒否されていないかを見る */
export const AI_CRAWLERS = [
  { ua: "GPTBot", owner: "OpenAI（学習用）" },
  { ua: "OAI-SearchBot", owner: "OpenAI（ChatGPT検索）" },
  { ua: "ChatGPT-User", owner: "OpenAI（ユーザー操作）" },
  { ua: "ClaudeBot", owner: "Anthropic" },
  { ua: "PerplexityBot", owner: "Perplexity" },
  { ua: "Google-Extended", owner: "Google（Gemini学習）" },
  { ua: "Applebot-Extended", owner: "Apple" },
  { ua: "CCBot", owner: "Common Crawl" },
] as const;

export interface RobotsInfo {
  exists: boolean;
  /** 拒否されているクローラ名 */
  blocked: string[];
  /** 許可されているクローラ名 */
  allowed: string[];
}

/** robots.txt を解析し、対象 URL への各 AI クローラのアクセス可否を返す */
export function evaluateRobots(robotsTxt: string | null, pageUrl: string, robotsUrl: string): RobotsInfo {
  if (robotsTxt === null) {
    return { exists: false, blocked: [], allowed: AI_CRAWLERS.map((c) => c.ua) };
  }
  const robots = robotsParser(robotsUrl, robotsTxt);
  const blocked: string[] = [];
  const allowed: string[] = [];
  for (const crawler of AI_CRAWLERS) {
    // isAllowed が undefined を返すのは URL がホスト外のとき。ここでは許可扱い
    if (robots.isAllowed(pageUrl, crawler.ua) === false) blocked.push(crawler.ua);
    else allowed.push(crawler.ua);
  }
  return { exists: true, blocked, allowed };
}

/**
 * オリジン単位で共通のファイル。ページごとに変わらないため、サイト診断では
 * 1 度だけ取得して全ページで使い回す。
 */
export interface SiteFiles {
  origin: string;
  /** robots.txt の中身。取得できなければ null */
  robotsTxt: string | null;
  /** robots.txt 内の Sitemap: 行 */
  sitemaps: string[];
  llmsTxt: { present: boolean; length: number; status: number };
  llmsFullTxt: { present: boolean; length: number };
}

/** robots.txt / llms.txt / llms-full.txt をまとめて取得する */
export async function fetchSiteFiles(origin: string): Promise<SiteFiles> {
  const [robotsRes, llmsRes, llmsFullRes] = await Promise.all([
    fetchText(`${origin}/robots.txt`, { timeoutMs: 8000 }),
    fetchText(`${origin}/llms.txt`, { timeoutMs: 8000 }),
    fetchText(`${origin}/llms-full.txt`, { timeoutMs: 8000 }),
  ]);

  const robotsTxt = robotsRes.ok && !looksLikeHtml(robotsRes) ? robotsRes.body : null;
  const llmsOk = llmsRes.ok && !looksLikeHtml(llmsRes) && llmsRes.body.trim().length > 0;
  const llmsFullOk =
    llmsFullRes.ok && !looksLikeHtml(llmsFullRes) && llmsFullRes.body.trim().length > 0;

  return {
    origin,
    robotsTxt,
    sitemaps: extractSitemaps(robotsTxt),
    llmsTxt: {
      present: llmsOk,
      length: llmsOk ? llmsRes.body.trim().length : 0,
      status: llmsRes.status,
    },
    llmsFullTxt: {
      present: llmsFullOk,
      length: llmsFullOk ? llmsFullRes.body.trim().length : 0,
    },
  };
}

/** robots.txt の `Sitemap: <url>` 行を集める */
export function extractSitemaps(robotsTxt: string | null): string[] {
  if (!robotsTxt) return [];
  const urls: string[] = [];
  for (const line of robotsTxt.split(/\r?\n/)) {
    const m = /^\s*sitemap\s*:\s*(\S+)/i.exec(line);
    if (m) urls.push(m[1]);
  }
  return [...new Set(urls)];
}

export function checkCrawlers(
  pageUrl: URL,
  $: cheerio.CheerioAPI,
  pageHeaders: Headers,
  files: SiteFiles,
): CheckResult[] {
  const origin = pageUrl.origin;
  const robotsUrl = `${origin}/robots.txt`;

  const results: CheckResult[] = [];

  // --- robots.txt による AI クローラ許可 -------------------------------------
  const info = evaluateRobots(files.robotsTxt, pageUrl.toString(), robotsUrl);

  if (info.blocked.length === 0) {
    results.push(
      check({
        id: "ai-crawlers-allowed",
        category: "crawlers",
        status: "pass",
        weight: 3,
        label: "主要なAIクローラがアクセス可能",
        evidence: info.exists
          ? `robots.txt で ${AI_CRAWLERS.length} 種のAIクローラがすべて許可されています`
          : "robots.txt が無いため、すべてのクローラが許可されています",
      }),
    );
  } else if (info.blocked.length === AI_CRAWLERS.length) {
    results.push(
      check({
        id: "ai-crawlers-allowed",
        category: "crawlers",
        status: "fail",
        weight: 3,
        label: "主要なAIクローラがすべてブロックされている",
        evidence: `robots.txt で拒否: ${info.blocked.join(", ")}`,
        advice:
          "robots.txt で AI クローラ（GPTBot, ClaudeBot, PerplexityBot など）が Disallow されています。AI検索に引用されたい場合は、これらの User-agent に対して Allow: / を設定するか、Disallow の記述を削除してください。",
      }),
    );
  } else {
    results.push(
      check({
        id: "ai-crawlers-allowed",
        category: "crawlers",
        status: "warn",
        weight: 3,
        label: "一部のAIクローラがブロックされている",
        evidence: `拒否: ${info.blocked.join(", ")} / 許可: ${info.allowed.join(", ")}`,
        advice:
          "一部の AI クローラが robots.txt で拒否されています。学習用クローラ（GPTBot, Google-Extended など）を意図的に止めている場合は問題ありませんが、検索用クローラ（OAI-SearchBot, ClaudeBot, PerplexityBot）まで止めると AI 検索での引用機会を失います。",
      }),
    );
  }

  // --- noindex ---------------------------------------------------------------
  const metaRobots = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
  const xRobots = (pageHeaders.get("x-robots-tag") ?? "").toLowerCase();
  const noindex = metaRobots.includes("noindex") || xRobots.includes("noindex");
  results.push(
    check({
      id: "noindex",
      category: "crawlers",
      status: noindex ? "fail" : "pass",
      weight: 2,
      label: noindex ? "noindex が設定されている" : "noindex が設定されていない",
      evidence: noindex
        ? `meta robots="${metaRobots || "-"}" / X-Robots-Tag="${xRobots || "-"}"`
        : undefined,
      advice:
        "このページは noindex が指定されており、検索エンジンにも AI 検索にも登録されません。公開したいページであれば meta robots / X-Robots-Tag の noindex を外してください。",
    }),
  );

  // --- llms.txt --------------------------------------------------------------
  const hasLlms = files.llmsTxt.present;
  results.push(
    check({
      id: "llms-txt",
      category: "crawlers",
      status: hasLlms ? "pass" : "warn",
      weight: 2,
      label: hasLlms ? "llms.txt が設置されている" : "llms.txt が設置されていない",
      evidence: hasLlms
        ? `${origin}/llms.txt（${files.llmsTxt.length} 文字）`
        : `${origin}/llms.txt → HTTP ${files.llmsTxt.status || "取得失敗"}`,
      advice:
        "llms.txt は、サイトの概要と主要ページの一覧を AI に向けて Markdown で提供するファイルです。サイトのルートに /llms.txt を置き、サイト名・一行説明・重要ページへのリンク一覧を記載すると、AI がサイト構造を理解しやすくなります。",
    }),
  );

  const hasLlmsFull = files.llmsFullTxt.present;
  results.push(
    optionalCheck({
      id: "llms-full-txt",
      category: "crawlers",
      present: hasLlmsFull,
      label: hasLlmsFull ? "/llms-full.txt がある" : "/llms-full.txt がない",
      evidence: hasLlmsFull
        ? `${origin}/llms-full.txt（${files.llmsFullTxt.length} 文字）`
        : undefined,
      advice:
        "llms-full.txt は、サイトの主要コンテンツ全文を 1 ファイルにまとめたものです（設定は任意）。ドキュメントやサービス説明が多いサイトでは、AI が一度に全体を読めるようになるため効果的です。",
    }),
  );

  return results;
}

/** 404 ページが 200 で返ってくるサイト対策: HTML が返ってきたらテキストファイルとみなさない */
function looksLikeHtml(res: { contentType: string; body: string }): boolean {
  if (res.contentType.includes("text/html")) return true;
  const head = res.body.slice(0, 500).trim().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}
