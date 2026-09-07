/**
 * 競合ページ・自社ページの測定（サーバー専用）。
 *
 * HTML → 測定値の部分は純関数（`measureHtml`）にして、テストでは
 * ローカルの HTML フィクスチャだけを使う（ネットワークに出ない）。
 * 取得は必ず normalizeUrl → assertPublicHost → fetchText の経路を通す。
 */
import * as cheerio from "cheerio";
import { countChars, extractContent } from "@/lib/analyzer/content";
import { assertPublicHost, FetchError, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import { extractJsonLd } from "@/lib/analyzer/jsonld";
import { extractMeta } from "@/lib/analyzer/meta";
import type { DiagnosisHeading, PageFailure, PageMeasurement } from "./types";

/** 同時に取得するページ数（相手サイトへの負荷配慮。実装ガイド §9.1） */
export const FETCH_CONCURRENCY = 3;

/** 1 ページあたりの取得タイムアウト */
export const PAGE_TIMEOUT_MS = 10_000;

/** 保持する見出しの上限（LLM へ渡す量を抑える） */
export const MAX_HEADINGS = 60;

/**
 * 公開日 / 更新日を探す。JSON-LD の datePublished / dateModified を最優先し、
 * 無ければ OGP の article:published_time、meta[name=date]、<time datetime> の順。
 * 表記はページのまま返す（解釈は画面側でしない。「取れた値をそのまま出す」）。
 */
export function extractDates($: cheerio.CheerioAPI): { publishedAt: string | null; modifiedAt: string | null } {
  let published: string | null = null;
  let modified: string | null = null;

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (!published && typeof obj.datePublished === "string") published = obj.datePublished.trim();
    if (!modified && typeof obj.dateModified === "string") modified = obj.dateModified.trim();
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") visit(value);
    }
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    try {
      visit(JSON.parse(raw));
    } catch {
      // 壊れた JSON-LD は無視する（構造化データの妥当性は A1 / A2 が見る）
    }
  });

  const meta = (selector: string): string | null => {
    const v = $(selector).attr("content")?.trim();
    return v ? v : null;
  };
  published ??= meta('meta[property="article:published_time"]') ?? meta('meta[name="pubdate"]') ?? meta('meta[name="date"]');
  modified ??= meta('meta[property="article:modified_time"]') ?? meta('meta[name="lastmod"]');

  if (!published) {
    const t = $("time[datetime]").first().attr("datetime")?.trim();
    if (t) published = t;
  }
  return { publishedAt: published, modifiedAt: modified };
}

/** h1〜h3 を出現順に集める（空見出しは無視） */
export function extractHeadingList($: cheerio.CheerioAPI): DiagnosisHeading[] {
  const out: DiagnosisHeading[] = [];
  $("h1, h2, h3").each((_, el) => {
    if (out.length >= MAX_HEADINGS) return;
    const level = Number(el.tagName.slice(1));
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    out.push({ level, text });
  });
  return out;
}

/** 同一オリジンを内部リンク、それ以外を外部リンクとして数える（重複 URL も 1 本ずつ数える） */
export function countLinks($: cheerio.CheerioAPI, baseUrl: string): { internalLinks: number; externalLinks: number } {
  let internalLinks = 0;
  let externalLinks = 0;
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return { internalLinks: 0, externalLinks: 0 };
  }
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#")) return;
    if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) return;
    let target: URL;
    try {
      target = new URL(href, base);
    } catch {
      return;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") return;
    if (target.origin === base.origin) internalLinks += 1;
    else externalLinks += 1;
  });
  return { internalLinks, externalLinks };
}

export interface MeasureHtmlOptions {
  /** リダイレクト後の URL。省略時は url */
  finalUrl?: string;
  /** 取得にかかった時間（ミリ秒） */
  fetchMs?: number;
}

/** HTML から測定値を作る（純関数・ネットワークに出ない） */
export function measureHtml(html: string, url: string, options: MeasureHtmlOptions = {}): PageMeasurement {
  const finalUrl = options.finalUrl ?? url;
  const $ = cheerio.load(html);
  const meta = extractMeta($);
  const content = extractContent(html, finalUrl, $);
  const jsonLd = extractJsonLd($);
  const dates = extractDates($);
  const links = countLinks($, finalUrl);
  const headings = extractHeadingList($);

  return {
    url,
    finalUrl,
    title: meta.title,
    description: meta.description,
    charCount: content.mainTextLength || countChars(content.mainText),
    images: content.images,
    headings,
    h1: headings.filter((h) => h.level === 1).map((h) => h.text),
    internalLinks: links.internalLinks,
    externalLinks: links.externalLinks,
    fetchMs: Math.max(0, Math.round(options.fetchMs ?? 0)),
    jsonLdTypes: jsonLd.types,
    publishedAt: dates.publishedAt,
    modifiedAt: dates.modifiedAt,
    mainText: content.mainText,
  };
}

/** 1 ページを取得して測る。取得できなければ FetchError を投げる */
export async function measureUrl(input: string, timeoutMs = PAGE_TIMEOUT_MS): Promise<PageMeasurement> {
  const url = normalizeUrl(input);
  await assertPublicHost(url);
  const startedAt = Date.now();
  const page = await fetchText(url.toString(), { timeoutMs });
  const fetchMs = Date.now() - startedAt;
  if (page.status === 0) throw new FetchError("ページに接続できませんでした", "network");
  if (!page.ok) throw new FetchError(`ページの取得に失敗しました（HTTP ${page.status}）`, "network");
  if (!page.contentType.includes("html") && !/<html[\s>]/i.test(page.body.slice(0, 2000))) {
    throw new FetchError("HTML ページではないため測定できません", "invalid_url");
  }
  return measureHtml(page.body, url.toString(), { finalUrl: page.finalUrl, fetchMs });
}

/** 取得のやり方を差し替えられるようにする（テストはローカル HTML を返す関数を渡す） */
export type PageFetcher = (url: string) => Promise<PageMeasurement>;

export interface MeasureManyInput {
  /** 順位付きの URL 一覧 */
  targets: ReadonlyArray<{ url: string; position: number }>;
  concurrency?: number;
  fetcher?: PageFetcher;
  signal?: AbortSignal;
}

export interface MeasureManyResult {
  measurements: Array<{ position: number; measurement: PageMeasurement }>;
  failures: PageFailure[];
}

function reasonOf(err: unknown): string {
  if (err instanceof FetchError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "ページを取得できませんでした";
}

/**
 * 複数ページを同時実行数を抑えて測る。
 * 1 ページの失敗は全体を止めず、理由付きで failures に残す（実装ガイド §9.1）。
 */
export async function measureMany(input: MeasureManyInput): Promise<MeasureManyResult> {
  const fetcher = input.fetcher ?? ((url: string) => measureUrl(url));
  const limit = Math.max(1, Math.min(input.concurrency ?? FETCH_CONCURRENCY, FETCH_CONCURRENCY));
  const measurements: Array<{ position: number; measurement: PageMeasurement }> = [];
  const failures: PageFailure[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= input.targets.length) return;
      if (input.signal?.aborted) return;
      const target = input.targets[index];
      try {
        measurements.push({ position: target.position, measurement: await fetcher(target.url) });
      } catch (err) {
        failures.push({ url: target.url, position: target.position, reason: reasonOf(err) });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, input.targets.length) }, () => worker()));
  measurements.sort((a, b) => a.position - b.position);
  failures.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  return { measurements, failures };
}
