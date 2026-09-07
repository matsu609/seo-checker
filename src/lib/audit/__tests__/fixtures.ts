/**
 * ルールのテストで使う HTML → AuditPage の変換。
 *
 * ルールは AuditPage しか見ないので、fetchText の戻り値を模した
 * オブジェクトを parseAuditPage に通せばネットワーク無しで検証できる。
 */
import type { FetchedText } from "@/lib/analyzer/fetch";
import { parseAuditPage } from "../parse";
import type { AuditContext, AuditPage, ProbeResult } from "../types";

export const ORIGIN = "https://example.test";

export interface FixtureOptions {
  url?: string;
  finalUrl?: string;
  status?: number;
  headers?: Record<string, string>;
  robotsAllowed?: boolean;
  loadMs?: number | null;
}

/** <head> と <body> を包んだ最小の HTML */
export function html(parts: { head?: string; body?: string; lang?: string | null }): string {
  const lang = parts.lang === undefined ? ' lang="ja"' : parts.lang === null ? "" : ` lang="${parts.lang}"`;
  return `<!doctype html><html${lang}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${parts.head ?? ""}</head><body>${parts.body ?? ""}</body></html>`;
}

/** 日本語の本文を chars 文字ぶん作る（本文量の閾値をまたぐテスト用） */
export function japaneseText(chars: number): string {
  const sentence = "当社は中小企業のウェブサイト制作と運用支援を行う会社です";
  return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
}

export function makeFetched(body: string, options: FixtureOptions = {}): FetchedText {
  const headers = new Headers({ "content-type": "text/html; charset=utf-8", ...(options.headers ?? {}) });
  return {
    ok: (options.status ?? 200) < 400,
    status: options.status ?? 200,
    finalUrl: options.finalUrl ?? options.url ?? `${ORIGIN}/page`,
    contentType: headers.get("content-type") ?? "",
    body,
    headers,
  };
}

/** HTML から AuditPage を作る */
export function pageFrom(body: string, options: FixtureOptions = {}): AuditPage {
  const fetched = makeFetched(body, options);
  const { page } = parseAuditPage(fetched, {
    requestedUrl: options.url ?? fetched.finalUrl,
    robotsAllowed: options.robotsAllowed ?? true,
    loadMs: options.loadMs ?? null,
  });
  return page;
}

/** ルールに渡すサイト情報。既定はすべて「問題なし」の状態 */
export function makeContext(overrides: Partial<AuditContext> = {}): AuditContext {
  return {
    origin: ORIGIN,
    entryUrl: `${ORIGIN}/`,
    siteFiles: {
      origin: ORIGIN,
      robotsTxt: "User-agent: *\nAllow: /\n",
      sitemaps: [`${ORIGIN}/sitemap.xml`],
      llmsTxt: { present: false, length: 0, status: 404 },
      llmsFullTxt: { present: false, length: 0 },
    },
    robotsExists: true,
    sitemapUrls: [],
    sitemapFound: true,
    faviconExists: true,
    httpServed: false,
    probes: {},
    signatures: {},
    ...overrides,
  };
}

export function probe(status: number, finalUrl: string, hops = 0): ProbeResult {
  return { status, finalUrl, hops };
}

/** 検出されたルール ID の一覧（順不同で比較しやすいように） */
export function ruleIds(issues: readonly { ruleId: string }[]): string[] {
  return issues.map((i) => i.ruleId);
}
