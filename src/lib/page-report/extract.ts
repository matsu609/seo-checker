/**
 * HTML → PageMeasurements（純関数・ネットワークに出ない）。
 *
 * 本文抽出・メタ情報・見出しは src/lib/analyzer の既存モジュールを使い、
 * ここではレポート固有の測定（ノイズ率・平均文長・セマンティックタグ・
 * 本文内リンク・alt の説明性・JSON-LD の必須プロパティ）を足す。
 */
import * as cheerio from "cheerio";
import { countChars, extractContent, normalizeText } from "@/lib/analyzer/content";
import type { FetchedText } from "@/lib/analyzer/fetch";
import { extractHeadings, findLevelSkips } from "@/lib/analyzer/headings";
import { extractMeta } from "@/lib/analyzer/meta";
import type { HeadingNode, JsonLdNode, PageMeasurements } from "./types";

/** 意味のある要素（div だらけになっていないかを見る） */
export const SEMANTIC_TAGS = ["main", "article", "section", "nav", "header", "footer", "aside"] as const;

/** 内容の分からないアンカーテキスト */
export const VAGUE_ANCHORS = [
  "こちら",
  "こちらから",
  "詳しくは",
  "詳細",
  "詳細はこちら",
  "もっと見る",
  "続きを読む",
  "リンク",
  "ここ",
  "click here",
  "read more",
  "more",
];

/** タイプごとの必須プロパティ（Google のリッチリザルト要件のうち中心的なもの） */
export const REQUIRED_PROPERTIES: Record<string, string[]> = {
  Article: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  TechArticle: ["headline", "author", "datePublished"],
  FAQPage: ["mainEntity"],
  HowTo: ["name", "step"],
  Organization: ["name", "url"],
  LocalBusiness: ["name", "address"],
  Product: ["name", "offers"],
  BreadcrumbList: ["itemListElement"],
  WebSite: ["name", "url"],
  Event: ["name", "startDate", "location"],
  Recipe: ["name", "recipeIngredient", "recipeInstructions"],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"],
};

/** AI が引用しやすい「主要なタイプ」（docs §2.1） */
export const KEY_TYPES = [
  "Article",
  "NewsArticle",
  "BlogPosting",
  "TechArticle",
  "FAQPage",
  "HowTo",
  "Organization",
  "LocalBusiness",
  "BreadcrumbList",
  "Product",
];

/** 全角を 2 幅として数える（analyzer/meta と同じ数え方） */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code > 0x2e7f ? 2 : 1;
  }
  return width;
}

export function fullWidthCount(text: string): number {
  return Math.ceil(displayWidth(text) / 2);
}

/** 句点・改行で文に割る（日本語と英語の両方） */
export function splitSentences(text: string): string[] {
  return normalizeText(text)
    .split(/(?<=[。．.!?！？])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 文字 2-gram の重なり（title と h1 が同じ話題を指しているか） */
export function bigramOverlap(a: string, b: string): number {
  const grams = (text: string) => {
    const clean = text.replace(/[\s\p{P}\p{S}]/gu, "");
    const set = new Set<string>();
    for (let i = 0; i + 2 <= clean.length; i += 1) set.add(clean.slice(i, i + 2));
    return set;
  };
  const setA = grams(a);
  const setB = grams(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const gram of setA) if (setB.has(gram)) shared += 1;
  return shared / Math.min(setA.size, setB.size);
}

type JsonObject = Record<string, unknown>;

function walk(node: unknown, visit: (obj: JsonObject) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as JsonObject;
    visit(obj);
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walk(value, visit);
    }
  }
}

function stripPrefix(name: string): string {
  return name.split(/[/#:]/).pop() || name;
}

/**
 * JSON-LD のノードを @type ごとに集め、必須プロパティの過不足を見る。
 * analyzer/jsonld.ts は @type の一覧しか返さないので、ここは独自に読む。
 */
export function extractJsonLdNodes($: cheerio.CheerioAPI): {
  blocks: number;
  parseErrors: number;
  nodes: JsonLdNode[];
  types: string[];
} {
  let blocks = 0;
  let parseErrors = 0;
  const nodes: JsonLdNode[] = [];
  const seen = new Set<string>();

  $('script[type="application/ld+json"]').each((_, el) => {
    blocks += 1;
    const raw = $(el).text();
    if (!raw.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      parseErrors += 1;
      return;
    }
    walk(data, (obj) => {
      const rawType = obj["@type"];
      const names = (Array.isArray(rawType) ? rawType : rawType ? [rawType] : []).filter(
        (n): n is string => typeof n === "string",
      );
      for (const name of names) {
        const type = stripPrefix(name);
        const properties = Object.keys(obj).filter((k) => !k.startsWith("@"));
        const required = REQUIRED_PROPERTIES[type] ?? [];
        const missing = required.filter((prop) => {
          const value = obj[prop];
          if (value === undefined || value === null) return true;
          if (typeof value === "string") return value.trim() === "";
          if (Array.isArray(value)) return value.length === 0;
          return false;
        });
        // 同じ @type が複数あっても代表を 1 つだけ残す（表が長くなりすぎるため）
        if (seen.has(type)) {
          const existing = nodes.find((n) => n.type === type);
          if (existing && existing.missing.length > 0 && missing.length === 0) {
            existing.missing = [];
            existing.properties = properties;
          }
          continue;
        }
        seen.add(type);
        nodes.push({ type, properties, missing });
      }
    });
  });

  return { blocks, parseErrors, nodes, types: nodes.map((n) => n.type) };
}

/** ページを測る */
export function measurePage(fetched: FetchedText): PageMeasurements {
  const finalUrl = fetched.finalUrl;
  const $ = cheerio.load(fetched.body);
  const meta = extractMeta($);
  const headingInfo = extractHeadings($);
  const content = extractContent(fetched.body, finalUrl, $);
  const jsonLd = extractJsonLdNodes($);

  const headings: HeadingNode[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    headings.push({ level: Number(el.tagName.slice(1)), text });
  });

  const sentences = splitSentences(content.mainText);
  const averageSentenceChars =
    sentences.length === 0 ? 0 : Math.round(countChars(content.mainText) / sentences.length);

  const semantic: Record<string, number> = {};
  for (const tag of SEMANTIC_TAGS) semantic[tag] = $(tag).length;

  // 本文内リンク: main / article の中にあり、nav / header / footer の中でないもの
  const bodyScope = $("main, article").length > 0 ? $("main, article") : $("body");
  const bodyAnchors = bodyScope.find("a[href]").filter((_, el) => $(el).closest("nav, header, footer").length === 0);

  let internalLinks = 0;
  let externalLinks = 0;
  let vagueAnchors = 0;
  const origin = safeOrigin(finalUrl);
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href")?.trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) return;
    let target: URL;
    try {
      target = new URL(href, finalUrl);
    } catch {
      return;
    }
    if (target.origin === origin) internalLinks += 1;
    else externalLinks += 1;
    const text = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (!text || VAGUE_ANCHORS.includes(text)) vagueAnchors += 1;
  });

  let imagesWithAlt = 0;
  let imagesWithDescriptiveAlt = 0;
  const images = $("img");
  images.each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt === undefined) return;
    imagesWithAlt += 1;
    if (alt.trim().length >= 6) imagesWithDescriptiveAlt += 1;
  });

  const hreflang: string[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const value = $(el).attr("hreflang")?.trim();
    if (value) hreflang.push(value);
  });

  const rawTextChars = content.rawTextLength;
  const mainTextChars = content.mainTextLength;
  const noiseRatio = rawTextChars > 0 ? Math.max(0, 1 - mainTextChars / rawTextChars) : 1;
  const subHeadings = headingInfo.counts[2] + headingInfo.counts[3];
  const h1Text = headingInfo.h1.join(" ");

  return {
    title: meta.title,
    titleChars: meta.title ? fullWidthCount(meta.title) : 0,
    description: meta.description,
    descriptionChars: meta.description ? fullWidthCount(meta.description) : 0,
    canonical: meta.canonical,
    ogTitle: meta.ogTitle,
    ogDescription: meta.ogDescription,
    ogImage: meta.ogImage,
    lang: meta.lang,
    hreflang,
    publishedAt: findDate($, jsonLd.nodes, "published"),
    modifiedAt: findDate($, jsonLd.nodes, "modified"),

    mainTextChars,
    rawTextChars,
    noiseRatio,
    averageSentenceChars,
    sentences: sentences.length,
    readable: content.readable,

    headings,
    h1Count: headingInfo.counts[1],
    headingSkips: findLevelSkips(headingInfo.sequence),
    subHeadings,
    charsPerHeading: headings.length > 0 ? Math.round(mainTextChars / headings.length) : mainTextChars,
    topicOverlap: meta.title && h1Text ? bigramOverlap(meta.title, h1Text) : 0,

    jsonLd,

    semantic,
    divCount: $("div").length,
    elementCount: $("body *").length,

    internalLinks,
    externalLinks,
    bodyLinks: bodyAnchors.length,
    vagueAnchors,

    images: images.length,
    imagesWithAlt,
    imagesWithDescriptiveAlt,
    altCoverage: images.length > 0 ? imagesWithAlt / images.length : 1,

    metaRobots: ($('meta[name="robots"]').attr("content") ?? "").toLowerCase(),
    xRobotsTag: (fetched.headers.get("x-robots-tag") ?? "").toLowerCase(),
    noindex:
      ($('meta[name="robots"]').attr("content") ?? "").toLowerCase().includes("noindex") ||
      (fetched.headers.get("x-robots-tag") ?? "").toLowerCase().includes("noindex"),
  };
}

function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** 公開日 / 更新日を meta と JSON-LD から探す */
function findDate($: cheerio.CheerioAPI, nodes: JsonLdNode[], kind: "published" | "modified"): string | null {
  const metaName = kind === "published" ? "article:published_time" : "article:modified_time";
  const fromMeta = $(`meta[property="${metaName}"]`).attr("content")?.trim();
  if (fromMeta) return fromMeta;
  const prop = kind === "published" ? "datePublished" : "dateModified";
  return nodes.some((n) => n.properties.includes(prop)) ? "（JSON-LD に記載あり）" : null;
}
