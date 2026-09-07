/**
 * 取得済み HTML → AuditPage（ルールが見る唯一のデータ）。
 *
 * 抽出は src/lib/analyzer の既存モジュールを使い回す（本文抽出・見出し・
 * メタ情報・JSON-LD）。ここで足すのは A1 でしか使わない項目
 * （廃止タグ・iframe・mixed content・リンクの内外判定・バイト数）だけ。
 */
import * as cheerio from "cheerio";
import type { FetchedText } from "@/lib/analyzer/fetch";
import { extractContent } from "@/lib/analyzer/content";
import { extractHeadings, findLevelSkips } from "@/lib/analyzer/headings";
import { extractJsonLd } from "@/lib/analyzer/jsonld";
import { extractMeta } from "@/lib/analyzer/meta";
import { canonicalizeUrl, extractLinks } from "@/lib/crawl/url";
import { DEPRECATED_TAGS } from "./config";
import { contentFingerprint, minHashSignature } from "./similarity";
import type { AuditPage, HeadingNode } from "./types";

/** 日本語は 1 文字の情報量が多いので、全角を 2 幅として数える（analyzer/meta と同じ数え方） */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code > 0x2e7f ? 2 : 1;
  }
  return width;
}

/** 全角換算の文字数（表示用）。displayWidth の半分を切り上げる */
export function fullWidthCount(text: string): number {
  return Math.ceil(displayWidth(text) / 2);
}

/** サブリソースの参照元になる属性 */
const RESOURCE_SELECTORS = [
  { selector: "img[src]", attr: "src" },
  { selector: "script[src]", attr: "src" },
  { selector: "link[href]", attr: "href" },
  { selector: "iframe[src]", attr: "src" },
  { selector: "source[src]", attr: "src" },
  { selector: "video[src]", attr: "src" },
  { selector: "audio[src]", attr: "src" },
] as const;

export interface ParseOptions {
  /** 待ち行列に入っていた URL（リダイレクト前）。既定は finalUrl */
  requestedUrl?: string;
  /** robots.txt が Googlebot にこの URL を許可しているか */
  robotsAllowed?: boolean;
  /** 実測した取得時間 */
  loadMs?: number | null;
}

/** MinHash 署名は結果 JSON には載せない（重複判定の途中結果） */
export interface ParsedPage {
  page: AuditPage;
  signature: number[];
}

export function parseAuditPage(fetched: FetchedText, options: ParseOptions = {}): ParsedPage {
  const finalUrl = canonicalizeUrl(fetched.finalUrl) ?? fetched.finalUrl;
  const requestedUrl = options.requestedUrl ?? finalUrl;
  const $ = cheerio.load(fetched.body);

  const meta = extractMeta($);
  const headingInfo = extractHeadings($);
  const jsonLd = extractJsonLd($);
  const content = extractContent(fetched.body, finalUrl, $);

  const headings: HeadingNode[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number(el.tagName.slice(1));
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    headings.push({ level, text });
  });

  const deprecatedTags = DEPRECATED_TAGS.filter((tag) => $(tag).length > 0);

  // 画像の alt / title。alt="" は装飾画像の意思表示なので「未設定」にしない
  let imagesWithoutAlt = 0;
  let imagesWithoutTitle = 0;
  const images = $("img");
  images.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined) imagesWithoutAlt += 1;
    const title = $(el).attr("title");
    if (title === undefined || title.trim() === "") imagesWithoutTitle += 1;
  });

  let origin = "";
  try {
    origin = new URL(finalUrl).origin;
  } catch {
    origin = "";
  }

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  for (const link of safeExtractLinks(fetched.body, finalUrl)) {
    try {
      if (new URL(link).origin === origin) internalLinks.push(link);
      else externalLinks.push(link);
    } catch {
      /* 壊れた URL は無視 */
    }
  }

  // https のページに http:// のサブリソースがあると、ブラウザが警告・遮断する
  const isHttps = finalUrl.startsWith("https://");
  const mixedContent = new Set<string>();
  if (isHttps) {
    for (const { selector, attr } of RESOURCE_SELECTORS) {
      $(selector).each((_, el) => {
        const raw = $(el).attr(attr)?.trim();
        if (raw && /^http:\/\//i.test(raw)) mixedContent.add(raw);
      });
    }
  }

  const contentLength = Number.parseInt(fetched.headers.get("content-length") ?? "", 10);
  const bytes = Number.isFinite(contentLength) && contentLength > 0
    ? contentLength
    : Buffer.byteLength(fetched.body, "utf8");

  const htmlLength = fetched.body.length;
  const textRatio = htmlLength > 0 ? content.rawTextLength / htmlLength : 0;

  const page: AuditPage = {
    url: requestedUrl,
    finalUrl,
    status: fetched.status,
    depth: null,
    contentType: fetched.contentType,
    bytes,
    contentEncoding: fetched.headers.get("content-encoding"),
    loadMs: options.loadMs ?? null,

    title: meta.title,
    titleWidth: meta.title ? displayWidth(meta.title) : 0,
    description: meta.description,
    descriptionWidth: meta.description ? displayWidth(meta.description) : 0,
    lang: meta.lang,

    canonical: meta.canonical,
    canonicalCount: $('link[rel="canonical"]').length,
    ogUrl: $('meta[property="og:url"]').attr("content")?.trim() || null,

    metaRobots: ($('meta[name="robots"]').attr("content") ?? "").toLowerCase(),
    xRobotsTag: (fetched.headers.get("x-robots-tag") ?? "").toLowerCase(),
    hasViewport: $('meta[name="viewport"]').length > 0,
    hasFaviconLink: $('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').length > 0,
    metaRefresh: $('meta[http-equiv]')
      .filter((_, el) => ($(el).attr("http-equiv") ?? "").toLowerCase() === "refresh")
      .first()
      .attr("content") ?? null,

    iframes: $("iframe").length,
    deprecatedTags: [...deprecatedTags],

    headings,
    h1: headingInfo.h1,
    headingSkips: findLevelSkips(headingInfo.sequence),

    mainTextLength: content.mainTextLength,
    rawTextLength: content.rawTextLength,
    htmlLength,
    textRatio,
    contentHash: contentFingerprint(content.mainText),

    images: images.length,
    imagesWithoutAlt,
    imagesWithoutTitle,

    internalLinks: [...new Set(internalLinks)],
    externalLinks: [...new Set(externalLinks)],
    mixedContent: [...mixedContent],

    jsonLd: {
      blocks: jsonLd.blocks,
      parseErrors: jsonLd.parseErrors,
      // 「読めたのに @type が 1 つも無い」ブロック数。個別には数えられないので概算
      withoutType: jsonLd.blocks > jsonLd.parseErrors && jsonLd.types.length === 0
        ? jsonLd.blocks - jsonLd.parseErrors
        : 0,
      types: jsonLd.types,
    },
    robotsAllowed: options.robotsAllowed ?? true,
  };

  return { page, signature: minHashSignature(content.mainText) };
}

/** 壊れた HTML でリンク抽出が落ちても 1 ページ分の解析は続ける */
function safeExtractLinks(html: string, baseUrl: string): string[] {
  try {
    return extractLinks(html, baseUrl);
  } catch {
    return [];
  }
}
