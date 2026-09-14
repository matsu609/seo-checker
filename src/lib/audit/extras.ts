/**
 * サイトの構成・信頼の分析に使う追加項目の抽出（AuditPage の後半の項目）。
 *
 * ルール（rules/*.ts）はここで抜いた値を参照しない。使うのは
 * src/lib/seo-analysis（内部リンクの構造・ページ種別・信頼の手がかり）だけ。
 * parse.ts から 1 回呼ばれ、戻り値をそのまま AuditPage に展開する。
 */
import type * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { MetaInfo } from "@/lib/analyzer/meta";
import { canonicalizeUrl } from "@/lib/crawl/url";
import type { AuditLink, OrganizationSchema } from "./types";

export interface PageExtras {
  links: AuditLink[];
  hreflang: string[];
  og: { title: boolean; description: boolean; image: boolean };
  hasBreadcrumb: boolean;
  published: string | null;
  modified: string | null;
  hasAuthor: boolean;
  phones: string[];
  hasPostalAddress: boolean;
  hasEmail: boolean;
  organization: OrganizationSchema | null;
}

/** ナビ・ヘッダー・フッター・サイドバー（この中のリンクは「本文のリンク」に数えない） */
const CHROME_SELECTOR =
  'nav, header, footer, aside, [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]';
/** 本文領域。あればこの中だけを本文とみなす */
const MAIN_SELECTOR = 'main, article, [role="main"]';
const BREADCRUMB_SELECTOR =
  '[class*="breadcrumb" i], [id*="breadcrumb" i], [class*="pankuzu" i], [aria-label*="breadcrumb" i], [aria-label*="パンくず"], [itemtype*="BreadcrumbList"]';
const AUTHOR_SELECTOR = '[rel~="author"], [itemprop="author"], [class*="author" i], [class*="writer" i], [class*="byline" i]';
const SKIP_SCHEME = /^(?:mailto|tel|sms|javascript|data|ftp):/i;
const NOFOLLOW_RELS = new Set(["nofollow", "ugc", "sponsored"]);
/** アンカーテキストの保存上限（分析には先頭だけあればよい） */
const MAX_ANCHOR_TEXT = 80;
/** ページごとに残す電話番号の上限 */
const MAX_PHONES = 5;

/** Organization / LocalBusiness 系とみなす @type（接頭辞は落として比較） */
const ORG_TYPE_RE =
  /^(?:Organization|Corporation|LocalBusiness|Store|Restaurant|MedicalBusiness|ProfessionalService|EducationalOrganization|GovernmentOrganization|NGO|Dentist|Physician|Hospital|Hotel|LodgingBusiness|FoodEstablishment|AutoDealer|RealEstateAgent|LegalService|Attorney|AccountingService|FinancialService|HealthAndBeautyBusiness|BeautySalon|HairSalon|DaySpa|SportsActivityLocation|HomeAndConstructionBusiness|TravelAgency|InsuranceAgency|AutomotiveBusiness|EntertainmentBusiness|ChildCare|Library|School|Church|ShoppingCenter|ClothingStore|ElectronicsStore|Florist|Bakery|CafeOrCoffeeShop|BarOrPub)$/;

/** 日本の電話番号（0 始まりで 3 区切り、または +81）。日付や郵便番号は 3 区切りにならないので混ざらない */
const PHONE_RE = /(?:\+81[-\s()]*\d{1,4}|0\d{1,4})[-\s()]+\d{1,4}[-\s()]+\d{3,4}(?!\d)/g;
/** 郵便番号（〒 付き）か「都道府県 + 市区町村郡」 */
const POSTAL_RE = /〒\s*\d{3}[-‐－]?\d{4}/;
const PREFECTURE_RE = /(?:北海道|東京都|京都府|大阪府|[一-龥]{2,3}県)[一-龥ぁ-んァ-ヶー]{1,8}(?:市|区|町|村|郡)/;
const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;

export function extractExtras(
  $: cheerio.CheerioAPI,
  finalUrl: string,
  origin: string,
  meta: MetaInfo,
  jsonLdTypes: readonly string[],
): PageExtras {
  const ld = readJsonLd($);
  const bodyText = visibleText($);

  return {
    links: extractInternalLinks($, finalUrl, origin),
    hreflang: extractHreflang($),
    og: { title: meta.ogTitle !== null, description: meta.ogDescription !== null, image: meta.ogImage !== null },
    hasBreadcrumb: jsonLdTypes.includes("BreadcrumbList") || $(BREADCRUMB_SELECTOR).length > 0,
    published: firstDate([
      $('meta[property="article:published_time"]').attr("content"),
      $('meta[name="pubdate"]').attr("content"),
      $('meta[name="date"]').attr("content"),
      $('meta[itemprop="datePublished"]').attr("content"),
      ld.datePublished,
      $("time[datetime]").first().attr("datetime"),
    ]),
    modified: firstDate([
      $('meta[property="article:modified_time"]').attr("content"),
      $('meta[property="og:updated_time"]').attr("content"),
      $('meta[itemprop="dateModified"]').attr("content"),
      ld.dateModified,
    ]),
    hasAuthor:
      Boolean($('meta[name="author"]').attr("content")?.trim()) ||
      ld.hasAuthor ||
      $(AUTHOR_SELECTOR).length > 0,
    phones: extractPhones($, bodyText),
    hasPostalAddress: POSTAL_RE.test(bodyText) || PREFECTURE_RE.test(bodyText),
    hasEmail: $('a[href^="mailto:"]').length > 0 || EMAIL_RE.test(bodyText),
    organization: ld.organization,
  };
}

/* ───────────── 内部リンク ───────────── */

function extractInternalLinks($: cheerio.CheerioAPI, finalUrl: string, origin: string): AuditLink[] {
  let base = finalUrl;
  const baseHref = $("base[href]").first().attr("href")?.trim();
  if (baseHref) {
    try {
      base = new URL(baseHref, finalUrl).toString();
    } catch {
      /* 壊れた base は無視 */
    }
  }
  const hasMain = $(MAIN_SELECTOR).length > 0;
  const found = new Map<string, AuditLink>();

  $("a[href], area[href]").each((_, el) => {
    const node = $(el);
    const raw = node.attr("href")?.trim() ?? "";
    if (!raw || raw.startsWith("#") || SKIP_SCHEME.test(raw)) return;
    const abs = canonicalizeUrl(raw, base);
    if (!abs) return;
    try {
      if (new URL(abs).origin !== origin) return;
    } catch {
      return;
    }

    const rel = (node.attr("rel") ?? "").toLowerCase().split(/\s+/);
    const nofollow = rel.some((r) => NOFOLLOW_RELS.has(r));
    const inChrome = node.closest(CHROME_SELECTOR).length > 0;
    const inContent = !inChrome && (!hasMain || node.closest(MAIN_SELECTOR).length > 0);
    const text = anchorText($, node);

    const existing = found.get(abs);
    if (!existing) {
      found.set(abs, { url: abs, text, nofollow, inContent });
      return;
    }
    // 同じ URL が複数回出るときは、1 本でも本文にあれば本文扱い、1 本でも follow なら follow。
    // アンカーテキストは本文側のものを優先する（ナビの短い語で上書きしない）
    if (inContent && !existing.inContent && text) existing.text = text;
    else if (!existing.text && text) existing.text = text;
    existing.inContent = existing.inContent || inContent;
    existing.nofollow = existing.nofollow && nofollow;
  });

  return [...found.values()];
}

function anchorText($: cheerio.CheerioAPI, node: cheerio.Cheerio<AnyNode>): string {
  const own = node.text().replace(/\s+/g, " ").trim();
  const text =
    own ||
    node.find("img[alt]").first().attr("alt")?.trim() ||
    node.attr("aria-label")?.trim() ||
    node.attr("title")?.trim() ||
    "";
  return text.slice(0, MAX_ANCHOR_TEXT);
}

function extractHreflang($: cheerio.CheerioAPI): string[] {
  const values = new Set<string>();
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const v = $(el).attr("hreflang")?.trim().toLowerCase();
    if (v) values.add(v);
  });
  return [...values];
}

/* ───────────── 本文テキスト・連絡先 ───────────── */

function visibleText($: cheerio.CheerioAPI): string {
  const body = $("body").clone();
  body.find("script, style, noscript, template, svg").remove();
  return body.text().replace(/\s+/g, " ");
}

function extractPhones($: cheerio.CheerioAPI, text: string): string[] {
  const phones = new Set<string>();
  const add = (raw: string) => {
    if (phones.size >= MAX_PHONES) return;
    const normalized = normalizePhone(raw);
    if (normalized) phones.add(normalized);
  };
  $('a[href^="tel:"]').each((_, el) => add(($(el).attr("href") ?? "").slice(4)));
  for (const m of text.matchAll(PHONE_RE)) add(m[0]);
  return [...phones];
}

/** 数字だけにし、+81 は 0 に直す。10〜11 桁でなければ電話番号とみなさない */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+81")) digits = `0${digits.slice(3)}`;
  digits = digits.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 11 || !digits.startsWith("0")) return null;
  return digits;
}

/* ───────────── 日付 ───────────── */

/** 最初に日付として読めた値を YYYY-MM-DD にして返す */
function firstDate(candidates: readonly (string | null | undefined)[]): string | null {
  for (const raw of candidates) {
    const v = raw?.trim();
    if (!v) continue;
    const iso = toIsoDate(v);
    if (iso) return iso;
  }
  return null;
}

export function toIsoDate(raw: string): string | null {
  // 2026年9月13日 のような和暦なしの日本語表記も読む
  const jp = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(raw);
  const source = jp ? `${jp[1]}-${jp[2].padStart(2, "0")}-${jp[3].padStart(2, "0")}` : raw.replace(/\//g, "-");
  const time = Date.parse(source);
  if (!Number.isFinite(time)) return null;
  const year = new Date(time).getUTCFullYear();
  if (year < 1995 || year > 2100) return null;
  return new Date(time).toISOString().slice(0, 10);
}

/* ───────────── JSON-LD（日付・著者・組織） ───────────── */

interface JsonLdFacts {
  datePublished: string | null;
  dateModified: string | null;
  hasAuthor: boolean;
  organization: OrganizationSchema | null;
}

type JsonObject = Record<string, unknown>;

function readJsonLd($: cheerio.CheerioAPI): JsonLdFacts {
  const facts: JsonLdFacts = { datePublished: null, dateModified: null, hasAuthor: false, organization: null };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw.trim()) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    walk(data, (node) => {
      if (!facts.datePublished && typeof node.datePublished === "string") facts.datePublished = node.datePublished;
      if (!facts.dateModified && typeof node.dateModified === "string") facts.dateModified = node.dateModified;
      if (node.author) facts.hasAuthor = true;
      if (!facts.organization) {
        const type = typeNames(node["@type"]).find((t) => ORG_TYPE_RE.test(t));
        if (type) {
          facts.organization = {
            type,
            telephone: typeof node.telephone === "string" ? normalizePhone(node.telephone) : null,
            hasAddress: hasValue(node.address),
            sameAs: Array.isArray(node.sameAs) ? node.sameAs.length : typeof node.sameAs === "string" && node.sameAs ? 1 : 0,
          };
        }
      }
    });
  });
  return facts;
}

function typeNames(t: unknown): string[] {
  const list = Array.isArray(t) ? t : t ? [t] : [];
  return list.filter((v): v is string => typeof v === "string").map((v) => v.split(/[/#:]/).pop() || v);
}

function hasValue(v: unknown): boolean {
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v && typeof v === "object" && Object.keys(v as object).length > 0);
}

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
