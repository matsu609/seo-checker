import robotsParser from "robots-parser";
import * as cheerio from "cheerio";
import { check, optionalCheck } from "./check";
import { fetchText } from "./fetch";
import type { CheckResult, CheckStatus } from "./types";

/* ─────────────────────────────────────────────────────────────
   AI クローラは用途で 2 つに分かれ、robots.txt でも別々に指定できる。

   - search  : AI の回答や AI 検索に「引用元として載せる」ための巡回。
               止めると AI 検索で引用される機会そのものが無くなる。
   - training: モデルの学習データ収集。止めても AI 検索への掲載は減らない。

   学習用を拒否するのは各社が正式に認めている運用であり、経営判断として
   まっとうな選択なので減点しない（状態は参考情報として表示する）。
   採点するのは検索用だけにする。
   ───────────────────────────────────────────────────────────── */
export type CrawlerPurpose = "search" | "training";

export const AI_CRAWLERS = [
  { ua: "OAI-SearchBot", owner: "OpenAI（ChatGPT検索）", purpose: "search" },
  { ua: "ChatGPT-User", owner: "OpenAI（ユーザー操作）", purpose: "search" },
  { ua: "Claude-SearchBot", owner: "Anthropic（検索）", purpose: "search" },
  { ua: "Claude-User", owner: "Anthropic（ユーザー操作）", purpose: "search" },
  { ua: "PerplexityBot", owner: "Perplexity（検索）", purpose: "search" },
  { ua: "GPTBot", owner: "OpenAI（学習）", purpose: "training" },
  { ua: "ClaudeBot", owner: "Anthropic（学習）", purpose: "training" },
  { ua: "Google-Extended", owner: "Google（Gemini の学習・グラウンディング）", purpose: "training" },
  { ua: "Applebot-Extended", owner: "Apple（学習）", purpose: "training" },
  { ua: "CCBot", owner: "Common Crawl（学習データ）", purpose: "training" },
] as const satisfies readonly { ua: string; owner: string; purpose: CrawlerPurpose }[];

export const SEARCH_CRAWLERS = AI_CRAWLERS.filter((c) => c.purpose === "search");
export const TRAINING_CRAWLERS = AI_CRAWLERS.filter((c) => c.purpose === "training");

/** ua がどちらの用途か。未知の名前は search 扱い（採点を甘くしない） */
export function purposeOf(ua: string): CrawlerPurpose {
  return AI_CRAWLERS.find((c) => c.ua === ua)?.purpose ?? "search";
}

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
  // 採点するのは検索用クローラだけ。学習用の拒否は正当な運用なので減点しない
  const info = evaluateRobots(files.robotsTxt, pageUrl.toString(), robotsUrl);
  const blockedSearch = info.blocked.filter((ua) => purposeOf(ua) === "search");
  const blockedTraining = info.blocked.filter((ua) => purposeOf(ua) === "training");
  const allowedSearch = SEARCH_CRAWLERS.map((c) => c.ua).filter(
    (ua) => !blockedSearch.includes(ua),
  );

  const searchStatus: CheckStatus =
    blockedSearch.length === 0
      ? "pass"
      : blockedSearch.length === SEARCH_CRAWLERS.length
        ? "fail"
        : "warn";
  results.push(
    check({
      id: "ai-crawlers-allowed",
      category: "crawlers",
      status: searchStatus,
      weight: 3,
      label:
        searchStatus === "pass"
          ? "AI 検索用クローラがアクセス可能"
          : searchStatus === "fail"
            ? "AI 検索用クローラがすべてブロックされている"
            : "一部の AI 検索用クローラがブロックされている",
      evidence:
        blockedSearch.length === 0
          ? info.exists
            ? `robots.txt で検索用 ${SEARCH_CRAWLERS.length} 種がすべて許可されています`
            : "robots.txt が無いため、すべてのクローラが許可されています"
          : `拒否: ${blockedSearch.join(", ")}${allowedSearch.length > 0 ? ` / 許可: ${allowedSearch.join(", ")}` : ""}`,
      advice:
        "OAI-SearchBot・PerplexityBot・Claude-SearchBot などの検索用クローラは、AI が回答に引用元として載せるためにページを読みに来ます。これを robots.txt で拒否すると、AI 検索に出る機会そのものが無くなります。学習用（GPTBot など）とは別の User-agent なので、学習だけ止めて検索は許可する、という指定ができます。",
    }),
  );

  // 学習用は参考表示のみ（配点 0）。止めているのは正当な選択でありうる
  results.push(
    check({
      id: "ai-crawlers-training",
      category: "crawlers",
      status: "info",
      label:
        blockedTraining.length === 0
          ? "学習用 AI クローラも許可されている（参考）"
          : `学習用 AI クローラを ${blockedTraining.length} 種拒否している（参考）`,
      evidence:
        blockedTraining.length === 0
          ? `学習用 ${TRAINING_CRAWLERS.length} 種はすべて許可されています`
          : `拒否: ${blockedTraining.join(", ")}`,
      advice:
        "学習用クローラ（GPTBot・ClaudeBot・Google-Extended・CCBot など）を拒否しても、AI 検索での引用や Google の検索結果への掲載は減りません。コンテンツを学習に使わせたくない場合の正式な手段なので、この項目は採点していません。",
    }),
  );

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
  // 参考表示のみ（配点 0）。llms.txt は提案段階の仕様で、これを読むと表明した
  // 主要な AI クローラはまだ無く、Google も AI 検索への掲載に専用ファイルは
  // 不要だとしている。無いことを減点する根拠が無い。
  const hasLlms = files.llmsTxt.present;
  results.push(
    check({
      id: "llms-txt",
      category: "crawlers",
      status: "info",
      label: hasLlms ? "llms.txt が設置されている（参考）" : "llms.txt は設置されていない（参考）",
      evidence: hasLlms
        ? `${origin}/llms.txt（${files.llmsTxt.length} 文字）`
        : `${origin}/llms.txt → HTTP ${files.llmsTxt.status || "取得失敗"}`,
      advice:
        "llms.txt は、サイトの概要と主要ページを AI 向けに Markdown でまとめる提案仕様です。読み取ることを表明した主要な AI クローラはまだ無く、Google も AI 検索への掲載に専用ファイルは不要だとしています。無くても不利にはならないため採点していません。設置する場合も、通常の HTML と robots.txt を整えることが先です。",
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
