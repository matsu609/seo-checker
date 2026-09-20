import robotsParser from "robots-parser";
import * as cheerio from "cheerio";
import { check, optionalCheck } from "./check";
import { FetchError, fetchText, looksLikeHtml, type FetchedText } from "./fetch";
import { notForSearch, type NotForSearchPage } from "./page-kind";
import { countBySeverity, lintRobotsTxt } from "./robots-syntax";
import type { CheckResult, CheckStatus, PageExclusion } from "./types";

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

/** 書式の指摘を画面に並べる上限（多すぎると読めない） */
const MAX_LINT_DETAILS = 8;

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

/**
 * 検索エンジンのクローラ。AI 検索の土台でもある（AI Overviews は Googlebot が取得した
 * ページから作られ、Copilot は Bingbot のインデックスを使う）。AI 用の User-agent だけを
 * 見ていると、`User-agent: Googlebot` を名指しで拒否しているサイトを見逃す。
 */
export const SEARCH_ENGINES = [
  { ua: "Googlebot", owner: "Google（検索・AI Overviews）" },
  { ua: "Bingbot", owner: "Microsoft（Bing・Copilot）" },
] as const satisfies readonly { ua: string; owner: string }[];

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

/**
 * 指定した User-agent のうち、この URL を取得できないものを返す。
 * robots.txt が無ければ全部取得できる（クローラの既定の扱いと同じ）。
 */
export function blockedAmong(
  robotsTxt: string | null,
  pageUrl: string,
  robotsUrl: string,
  uas: readonly string[],
): string[] {
  if (robotsTxt === null) return [];
  const robots = robotsParser(robotsUrl, robotsTxt);
  // isAllowed が undefined を返すのは URL がホスト外のとき。ここでは許可扱い
  return uas.filter((ua) => robots.isAllowed(pageUrl, ua) === false);
}

/** robots.txt を解析し、対象 URL への各 AI クローラのアクセス可否を返す */
export function evaluateRobots(robotsTxt: string | null, pageUrl: string, robotsUrl: string): RobotsInfo {
  const all = AI_CRAWLERS.map((c) => c.ua);
  if (robotsTxt === null) {
    return { exists: false, blocked: [], allowed: all };
  }
  const blocked = blockedAmong(robotsTxt, pageUrl, robotsUrl, all);
  return { exists: true, blocked, allowed: all.filter((ua) => !blocked.includes(ua)) };
}

/**
 * robots.txt の取得結果。`robotsTxt` が null でも理由は 3 通りあり、直し方が違う。
 * - 404（無い。クローラは全許可として扱うので致命的ではない）
 * - 200 だが HTML が返る（404 ページの取り違え。書いたはずの Sitemap 行や Disallow が
 *   まったく効いていない状態で、運用者はふつう気づけない）
 * - 5xx / 取得失敗（Google は robots.txt が 5xx を返し続けるとサイト全体のクロールを止める）
 */
export interface RobotsFetch {
  /** HTTP ステータス。接続できなければ 0 */
  status: number;
  /** 200 で返ってきた中身が HTML だった（robots.txt として機能していない） */
  html: boolean;
  /** 取得できた robots.txt の文字数 */
  length: number;
}

/** 定番の場所（/sitemap.xml）にサイトマップがあるか */
export interface SitemapFetch {
  present: boolean;
  status: number;
}

/**
 * オリジン単位で共通のファイル。ページごとに変わらないため、サイト診断では
 * 1 度だけ取得して全ページで使い回す。
 */
export interface SiteFiles {
  origin: string;
  /** robots.txt の中身。取得できなければ null */
  robotsTxt: string | null;
  /** robots.txt の取得結果（無い / 誤設定 / エラーの見分けに使う） */
  robots: RobotsFetch;
  /** robots.txt 内の Sitemap: 行 */
  sitemaps: string[];
  /** robots.txt に Sitemap 行が無いときの定番の場所（/sitemap.xml） */
  sitemapXml: SitemapFetch;
  llmsTxt: { present: boolean; length: number; status: number };
  llmsFullTxt: { present: boolean; length: number };
}

/**
 * 取得できなかったファイルで診断全体を止めない。
 * fetchText は 3MB 超・転送先が内部アドレスなどで FetchError を投げるが、
 * robots.txt / llms.txt / sitemap.xml はどれも任意のファイルなので「無い」で扱う。
 */
async function optionalFetch(url: string): Promise<FetchedText> {
  try {
    return await fetchText(url, { timeoutMs: 8000 });
  } catch {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      body: "",
      headers: new Headers(),
    };
  }
}

/** robots.txt / llms.txt / llms-full.txt / sitemap.xml をまとめて取得する */
export async function fetchSiteFiles(origin: string): Promise<SiteFiles> {
  const [robotsRes, llmsRes, llmsFullRes, sitemapXml] = await Promise.all([
    optionalFetch(`${origin}/robots.txt`),
    optionalFetch(`${origin}/llms.txt`),
    optionalFetch(`${origin}/llms-full.txt`),
    probeSitemap(`${origin}/sitemap.xml`),
  ]);

  const robotsHtml = robotsRes.ok && looksLikeHtml(robotsRes);
  const robotsTxt = robotsRes.ok && !robotsHtml ? robotsRes.body : null;
  const llmsOk = llmsRes.ok && !looksLikeHtml(llmsRes) && llmsRes.body.trim().length > 0;
  const llmsFullOk =
    llmsFullRes.ok && !looksLikeHtml(llmsFullRes) && llmsFullRes.body.trim().length > 0;

  return {
    origin,
    robotsTxt,
    robots: {
      status: robotsRes.status,
      html: robotsHtml,
      length: robotsTxt?.length ?? 0,
    },
    sitemaps: extractSitemaps(robotsTxt),
    sitemapXml,
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

/**
 * 定番の場所にサイトマップがあるかだけを見る。中身の URL は使わないので 256KB で打ち切る
 * （サイトマップは数 MB になることがあり、有無の確認のために全部落とす必要はない）。
 * 打ち切りに達したということは、それだけの量が返ってきたということなので「ある」と扱う。
 */
async function probeSitemap(url: string): Promise<SitemapFetch> {
  try {
    const res = await fetchText(url, { timeoutMs: 8000, maxBytes: 256 * 1024 });
    return { present: looksLikeSitemap(res), status: res.status };
  } catch (err) {
    if (err instanceof FetchError && err.code === "too_large") return { present: true, status: 200 };
    return { present: false, status: 0 };
  }
}

/** サイトマップとして読める XML が返ってきたか（404 ページを 200 で返すサイト対策） */
function looksLikeSitemap(res: FetchedText): boolean {
  if (!res.ok || looksLikeHtml(res)) return false;
  const head = res.body.slice(0, 2000);
  return /<(urlset|sitemapindex)[\s>]/i.test(head);
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

/** meta robots / X-Robots-Tag の noindex を読む（小文字に揃えて返す） */
export function readNoindex(
  $: cheerio.CheerioAPI,
  pageHeaders: Headers,
): { noindex: boolean; metaRobots: string; xRobots: string } {
  const metaRobots = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
  const xRobots = (pageHeaders.get("x-robots-tag") ?? "").toLowerCase();
  return { noindex: metaRobots.includes("noindex") || xRobots.includes("noindex"), metaRobots, xRobots };
}

/** この URL で robots.txt に拒否されている検索用クローラ */
function blockedSearchCrawlers(files: SiteFiles, url: string): string[] {
  return evaluateRobots(files.robotsTxt, url, `${new URL(url).origin}/robots.txt`).blocked.filter(
    (ua) => purposeOf(ua) === "search",
  );
}

/**
 * robots.txt の拒否が「意図した拒否」か。
 *
 * サイト内検索の結果ページなどを robots.txt で拒否するのも定石で、noindex と同じく
 * 「直すべき問題」ではない。ただしサイト全体が拒否されている（Disallow: /）場合は
 * それ自体が重大な問題なので、**トップページが許可されているときだけ**意図した拒否と
 * みなす（そうしないと Disallow: / を見逃す）。
 * 該当しなければ null（拒否されていない、ふつうのページ、サイト全体の拒否）。
 */
export function intendedRobotsBlock(pageUrl: URL, files: SiteFiles): NotForSearchPage | null {
  if (blockedSearchCrawlers(files, pageUrl.toString()).length === 0) return null;
  const kind = notForSearch(pageUrl.toString());
  if (!kind) return null;
  const homeAllowed = blockedSearchCrawlers(files, `${pageUrl.origin}/`).length === 0;
  return homeAllowed ? kind : null;
}

/**
 * 「もともと検索に載せないページ」が、実際に検索から外されているか。
 * 該当するページは診断しても採点しない（参考扱い。types.ts の PageExclusion）。
 * URL の用途だけでは判定しない: /search が検索に載る状態なら、その title や
 * 説明文はふつうに問われるべきなので採点する。
 */
export function searchExclusion(
  pageUrl: URL,
  $: cheerio.CheerioAPI,
  pageHeaders: Headers,
  files: SiteFiles,
): PageExclusion | null {
  const kind = notForSearch(pageUrl.toString());
  if (!kind) return null;
  const noindex = readNoindex($, pageHeaders).noindex;
  const robots = intendedRobotsBlock(pageUrl, files) !== null;
  if (!noindex && !robots) return null;
  return { label: kind.label, noindex, robots };
}

/** robots.txt が正しく置かれているか（無い / HTML が返る / エラー） */
function robotsFileCheck(files: SiteFiles, origin: string): CheckResult {
  const url = `${origin}/robots.txt`;
  const { status, html, length } = files.robots;

  if (html) {
    return check({
      id: "robots-txt",
      category: "crawlers",
      status: "fail",
      weight: 1,
      label: "robots.txt の代わりに HTML が返っている",
      evidence: `${url} → HTTP ${status} だが中身が HTML（robots.txt として読まれません）`,
      advice:
        "robots.txt を要求したのに、ページが見つからないときの HTML（404 ページ）が返っています。クローラはこれを robots.txt として読まないため、書いたはずの Sitemap 行や Disallow がまったく効いていません。サイトのルートに、文字だけのファイルとして robots.txt を置いてください。",
    });
  }
  if (files.robotsTxt === null && (status === 0 || status >= 500)) {
    return check({
      id: "robots-txt",
      category: "crawlers",
      status: "fail",
      weight: 1,
      label: "robots.txt がエラーを返している",
      evidence: `${url} → ${status === 0 ? "接続できませんでした" : `HTTP ${status}`}`,
      advice:
        "robots.txt がサーバーエラーを返しています。Google は robots.txt が 5xx を返す状態が続くと、安全側に倒して**サイト全体のクロールを止めます**。サーバーの設定を直し、ファイルが無いときは 404 を返すようにしてください（404 なら全許可として扱われます）。",
    });
  }
  if (files.robotsTxt === null) {
    return check({
      id: "robots-txt",
      category: "crawlers",
      status: "warn",
      weight: 1,
      label: "robots.txt が置かれていない",
      evidence: `${url} → HTTP ${status || "取得失敗"}`,
      advice:
        "robots.txt はクローラが最初に読むファイルです。無くてもクロールは止まりません（すべて許可として扱われます）が、サイトマップの場所を知らせる「Sitemap:」の行が書けず、発見が遅くなります。「User-agent: *」「Allow: /」「Sitemap: <サイトマップの URL>」の 3 行だけでも置いてください。",
    });
  }
  return check({
    id: "robots-txt",
    category: "crawlers",
    status: "pass",
    weight: 1,
    label: "robots.txt が置かれている",
    evidence: `${url}（${length} 文字）`,
    advice:
      "robots.txt はクローラが最初に読むファイルです。サイトのルートに置いてください。",
  });
}

/** robots.txt の書式。robots.txt が無いページでは項目自体を出さない */
function robotsSyntaxCheck(files: SiteFiles): CheckResult | null {
  if (files.robotsTxt === null) return null;
  const issues = lintRobotsTxt(files.robotsTxt);
  const counts = countBySeverity(issues);
  const status: CheckStatus = counts.error > 0 ? "fail" : counts.warn > 0 ? "warn" : "pass";
  const details = issues
    .slice(0, MAX_LINT_DETAILS)
    .map((i) => (i.line > 0 ? `${i.line} 行目: ${i.message}` : i.message));
  if (issues.length > MAX_LINT_DETAILS) {
    details.push(`ほか ${issues.length - MAX_LINT_DETAILS} 件`);
  }
  return check({
    id: "robots-syntax",
    category: "crawlers",
    status,
    weight: 1,
    label:
      status === "pass"
        ? "robots.txt の書式に問題がない"
        : status === "warn"
          ? `robots.txt に気になる書き方が ${counts.warn} 件ある`
          : `robots.txt に効いていない行が ${counts.error} 件ある`,
    evidence:
      status === "pass"
        ? issues.length > 0
          ? "効かない行はありません（参考の指摘のみ）"
          : undefined
        : "クローラは書式の誤った行を、何も言わずに読み飛ばします",
    details,
    advice:
      "robots.txt は 1 行ずつ「ディレクティブ: 値」で書きます。綴りの誤り・全角の空白・User-agent より前の Disallow・絶対 URL を書いた Disallow は、エラーにならず黙って無視されるため、「書いたのに効いていない」状態になります。上の行番号の箇所を直してください。",
  });
}

/** 検索エンジンのクローラ（Googlebot / Bingbot）の可否 */
function searchEngineCheck(pageUrl: URL, files: SiteFiles, robotsUrl: string): CheckResult {
  const uas = SEARCH_ENGINES.map((c) => c.ua);
  const blocked = blockedAmong(files.robotsTxt, pageUrl.toString(), robotsUrl, uas);
  const allowed = uas.filter((ua) => !blocked.includes(ua));

  // サイト内検索の結果ページなどの意図した拒否は減点しない。ただしトップページまで
  // 拒否されている（Disallow: /）ときは本物の問題なので、意図した拒否とみなさない
  const homeBlocked = blockedAmong(files.robotsTxt, `${pageUrl.origin}/`, robotsUrl, uas);
  const intended =
    blocked.length > 0 && homeBlocked.length === 0 ? notForSearch(pageUrl.toString()) : null;

  const status: CheckStatus =
    blocked.length === 0 || intended ? "pass" : blocked.length === uas.length ? "fail" : "warn";
  return check({
    id: "search-crawlers-allowed",
    category: "crawlers",
    status,
    weight: 3,
    label: intended
      ? `${intended.label}のため robots.txt での拒否は適切`
      : status === "pass"
        ? "検索エンジンのクローラがアクセス可能"
        : status === "fail"
          ? "検索エンジンのクローラがすべてブロックされている"
          : `${blocked.join(" / ")} がブロックされている`,
    evidence:
      blocked.length === 0
        ? files.robotsTxt === null
          ? "robots.txt が無いため、すべてのクローラが許可されています"
          : `robots.txt で ${uas.join(" / ")} がすべて許可されています`
        : `拒否: ${blocked.join(", ")}${allowed.length > 0 ? ` / 許可: ${allowed.join(", ")}` : ""}${
            intended ? ` — ${intended.reason}robots.txt で拒否したままで問題ありません（トップページは許可されています）。` : ""
          }`,
    advice:
      "Googlebot は Google 検索だけでなく AI Overviews（検索結果の上に出る AI の回答）のもとになるページも取得します。Bingbot は Bing と Copilot のインデックスです。これらを robots.txt で拒否すると、検索にも AI の回答にも載らなくなります。サイト内検索の結果・買い物かご・ログイン後の画面など、もともと検索に載せないページであれば、拒否したままで問題ありません。",
  });
}

/** サイトマップの場所（robots.txt の Sitemap 行 → 定番の /sitemap.xml の順に見る） */
function sitemapCheck(files: SiteFiles, origin: string): CheckResult {
  if (files.sitemaps.length > 0) {
    return check({
      id: "robots-sitemap",
      category: "crawlers",
      status: "pass",
      weight: 1,
      label: "robots.txt にサイトマップの場所が書かれている",
      evidence: `Sitemap: ${files.sitemaps.slice(0, 2).join(" / ")}${files.sitemaps.length > 2 ? ` ほか ${files.sitemaps.length - 2} 件` : ""}`,
      advice: "robots.txt の Sitemap 行は、クローラがサイト全体のページ一覧を見つける手がかりです。",
    });
  }
  if (files.sitemapXml.present) {
    return check({
      id: "robots-sitemap",
      category: "crawlers",
      status: "warn",
      weight: 1,
      label: "サイトマップはあるが robots.txt に書かれていない",
      evidence: `${origin}/sitemap.xml は見つかりましたが、robots.txt に Sitemap: の行がありません`,
      advice:
        "robots.txt に「Sitemap: " + origin + "/sitemap.xml」の 1 行を足してください。定番の場所にあるサイトマップはクローラも探しに来ますが、明示すると確実に見つかり、場所を変えたときにも追随できます。",
    });
  }
  return check({
    id: "robots-sitemap",
    category: "crawlers",
    status: "fail",
    weight: 1,
    label: "サイトマップが見つからない",
    evidence: `robots.txt に Sitemap: の行が無く、${origin}/sitemap.xml も見つかりませんでした（HTTP ${files.sitemapXml.status || "取得失敗"}）`,
    advice:
      "サイトマップ（sitemap.xml）は、サイトにあるページの一覧を XML で書いたファイルです。多くの CMS（WordPress など）は自動で作ります。サイトのルートに置き、robots.txt に「Sitemap: <その URL>」の行を足してください。新しく作ったページや、内部リンクの少ないページが見つけてもらえるようになります。",
  });
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

  // --- robots.txt そのものが正しく置かれているか -----------------------------
  // 無い（404）／HTML が返る（404 ページの取り違え）／5xx を分けて出す。書いたつもりの
  // Sitemap 行や Disallow がまったく効いていない状態は、運用者からは見えないため。
  results.push(robotsFileCheck(files, origin));

  // --- robots.txt の書式 ------------------------------------------------------
  // robots-parser は壊れた行を黙って読み飛ばす。「書いたのに効いていない」行はここで出す
  const lintCheck = robotsSyntaxCheck(files);
  if (lintCheck) results.push(lintCheck);

  // --- 検索エンジンのクローラ（Googlebot / Bingbot）--------------------------
  // AI 検索の土台。AI 用の User-agent だけを見ていると名指しの拒否を見逃す
  results.push(searchEngineCheck(pageUrl, files, robotsUrl));

  // --- robots.txt による AI クローラ許可 -------------------------------------
  // 採点するのは検索用クローラだけ。学習用の拒否は正当な運用なので減点しない
  const info = evaluateRobots(files.robotsTxt, pageUrl.toString(), robotsUrl);
  const blockedSearch = info.blocked.filter((ua) => purposeOf(ua) === "search");
  const blockedTraining = info.blocked.filter((ua) => purposeOf(ua) === "training");
  const allowedSearch = SEARCH_CRAWLERS.map((c) => c.ua).filter(
    (ua) => !blockedSearch.includes(ua),
  );

  // 検索に載せないページの意図した拒否は減点しない（判定は intendedRobotsBlock）
  const intendedBlock = intendedRobotsBlock(pageUrl, files);

  const searchStatus: CheckStatus =
    blockedSearch.length === 0 || intendedBlock
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
        intendedBlock !== null
          ? `${intendedBlock.label}のため robots.txt での拒否は適切`
          : searchStatus === "pass"
            ? "AI 検索用クローラがアクセス可能"
            : searchStatus === "fail"
              ? "AI 検索用クローラがすべてブロックされている"
              : "一部の AI 検索用クローラがブロックされている",
      evidence:
        blockedSearch.length === 0
          ? info.exists
            ? `robots.txt で検索用 ${SEARCH_CRAWLERS.length} 種がすべて許可されています`
            : "robots.txt が無いため、すべてのクローラが許可されています"
          : `拒否: ${blockedSearch.join(", ")}${allowedSearch.length > 0 ? ` / 許可: ${allowedSearch.join(", ")}` : ""}${
              intendedBlock
                ? ` — ${intendedBlock.reason}robots.txt で拒否したままで問題ありません（トップページは許可されています）。`
                : ""
            }`,
      advice:
        "OAI-SearchBot・PerplexityBot・Claude-SearchBot などの検索用クローラは、AI が回答に引用元として載せるためにページを読みに来ます。これを robots.txt で拒否すると、AI 検索に出る機会そのものが無くなります。学習用（GPTBot など）とは別の User-agent なので、学習だけ止めて検索は許可する、という指定ができます。サイト内検索の結果・買い物かご・ログイン後の画面など、もともと検索に載せないページであれば、拒否したままで問題ありません。",
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

  // --- サイトマップの場所 -----------------------------------------------------
  results.push(sitemapCheck(files, origin));

  // --- noindex ---------------------------------------------------------------
  // noindex は間違いとは限らない。サイト内検索の結果・買い物かご・ログイン後の画面
  // などは検索に載せない方が正しく、外させると中身の薄いページが大量に登録される。
  // URL から用途が分かるページでは、jsonld-website と同じく配点を残したまま減点だけ
  // を外す（判定の一覧は page-kind.ts）。
  const { noindex, metaRobots, xRobots } = readNoindex($, pageHeaders);
  const intentional = noindex ? notForSearch(pageUrl.toString()) : null;
  const noindexSource = `meta robots="${metaRobots || "-"}" / X-Robots-Tag="${xRobots || "-"}"`;
  results.push(
    check({
      id: "noindex",
      category: "crawlers",
      status: !noindex || intentional ? "pass" : "fail",
      weight: 2,
      label: !noindex
        ? "noindex が設定されていない"
        : intentional
          ? `${intentional.label}のため noindex は適切`
          : "noindex が設定されている",
      evidence: !noindex
        ? undefined
        : intentional
          ? `${noindexSource} — ${intentional.reason}noindex のままにしておくのが正しい設定です。`
          : noindexSource,
      advice:
        "このページは noindex が指定されており、検索エンジンにも AI 検索にも登録されません。公開したいページであれば meta robots / X-Robots-Tag の noindex を外してください。サイト内検索の結果・買い物かご・ログイン後の画面など、もともと検索に載せないページであれば、そのままで問題ありません。",
    }),
  );

  // --- llms.txt --------------------------------------------------------------
  // 有無だけを採点する（配点 1。利用者の決定 2026-09-18「無料診断の評価に llms.txt の有無を入れる。有無だけでよい」）。
  // 中身の良し悪しは精密診断（validateLlmsTxt）で見る。r? までは参考表示（配点 0）だった。
  const hasLlms = files.llmsTxt.present;
  results.push(
    check({
      id: "llms-txt",
      category: "crawlers",
      status: hasLlms ? "pass" : "fail",
      label: hasLlms ? "llms.txt が設置されている" : "llms.txt が設置されていない",
      evidence: hasLlms
        ? `${origin}/llms.txt（${files.llmsTxt.length} 文字）`
        : `${origin}/llms.txt → HTTP ${files.llmsTxt.status || "取得失敗"}`,
      advice:
        "llms.txt は、サイトの概要と主要ページを AI 向けに Markdown でまとめたテキストファイルです。サイトのルート（/llms.txt）に置くと、AI 検索がサイトを読むときの案内になります。1 行目に「# サイト名」、次に「> 1〜2 文の概要」、そのあとに「## サービス」「## 会社情報」のような見出しごとに「- [ページ名](URL): 1 行の説明」を並べてください。精密診断では、このサイトに合わせて何を書くべきかまで出します。",
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

