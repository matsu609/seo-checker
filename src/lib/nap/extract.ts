/**
 * ページの HTML から NAP の候補を抜く（サーバー専用。cheerio）。
 *
 * - 構造化データ（JSON-LD の Organization / LocalBusiness 系）: name / telephone / address / url
 * - 電話番号: tel: リンクと本文の日本の番号
 * - 住所: 〒 または都道府県から始まる 1 行
 * - 店名の候補: JSON-LD の name・og:site_name・copyright（© 20xx ○○）・title の先頭
 * - 会社概要・お問い合わせなどへのリンク（自社サイトの確認で辿る）
 */
import * as cheerio from "cheerio";
import { phoneCandidates } from "@/lib/citations/analyze";

export interface JsonLdOrg {
  type: string;
  name: string | null;
  telephone: string | null;
  address: string | null;
  url: string | null;
}

export interface ExtractedNap {
  jsonLd: JsonLdOrg[];
  /** 数字だけの電話番号（重複なし） */
  phones: string[];
  addresses: string[];
  names: string[];
  /** フッターと本文のテキスト（店名が出ているかの判定に使う） */
  text: string;
  /** 会社概要・お問い合わせなどのリンク（優先度の高い順） */
  candidatePages: { url: string; text: string; score: number }[];
  /** 外部サイトへのリンク（ホストごとに 1 件。媒体のページに自社サイトのリンクがあるかを見る） */
  externalLinks: string[];
}

const ORG_TYPE_RE =
  /^(?:Organization|Corporation|LocalBusiness|Store|Restaurant|MedicalBusiness|ProfessionalService|EducationalOrganization|Dentist|Physician|Hospital|Hotel|LodgingBusiness|FoodEstablishment|AutoDealer|RealEstateAgent|LegalService|Attorney|AccountingService|FinancialService|HealthAndBeautyBusiness|BeautySalon|HairSalon|DaySpa|SportsActivityLocation|HomeAndConstructionBusiness|TravelAgency|InsuranceAgency|AutomotiveBusiness|EntertainmentBusiness|ChildCare|Library|School|ShoppingCenter|ClothingStore|ElectronicsStore|Florist|Bakery|CafeOrCoffeeShop|BarOrPub|Clinic|Pharmacy|VeterinaryCare|GymOrFitnessCenter|NailSalon|ExerciseGym|Locksmith|MovingCompany|Plumber|Electrician|RoofingContractor|GeneralContractor)$/i;

/** 住所らしい並び（〒 または都道府県から最大 60 文字。切る位置は ADDRESS_STOP で決める） */
const ADDRESS_RE = /(?:〒\s*\d{3}[-‐－]?\d{4}\s*)?(?:北海道|東京都|京都府|大阪府|[一-龥]{2,3}県)[一-龥ぁ-んァ-ヶーa-zA-Z0-9０-９\-‐－−\s]{3,60}/g;
/** 住所のあとに続きがちな語（ここで切る） */
const ADDRESS_STOP = /\s*(?:TEL|Tel|tel|ＴＥＬ|電話|FAX|Fax|ＦＡＸ|営業|定休|受付|MAP|Map|アクセス|Copyright|copyright|All rights|Mail|E-?mail|メール|株式会社|有限会社|合同会社|[（(©]).*$/;
const MAX_ITEMS = 6;
const MAX_EXTERNAL_LINKS = 60;

/** 会社概要・お問い合わせなどのリンクの重み */
const PAGE_HINTS: [RegExp, number][] = [
  [/会社概要|会社案内|企業情報|企業概要|法人概要|事業所|店舗情報|店舗案内|店舗一覧|医院概要|クリニック概要|施設概要|概要/, 3],
  [/company|corporate|about|profile|overview|office|outline/i, 3],
  [/お問い?合わ?せ|問合せ|contact/i, 2],
  [/アクセス|所在地|地図|access|location|map/i, 2],
  [/店舗|shop|store/i, 1],
];

/**
 * リンクを絶対 URL にする（http / https だけ。フラグメントは落とす）。
 * クロール用の canonicalizeUrl は末尾のスラッシュを落とすが、ここではサイトが書いたとおりの URL で開く
 * （/company/ を /company にすると 404 や余計な転送になるサイトがある）。
 */
export function absoluteUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    u.username = "";
    u.password = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** %xx を戻す。壊れたエンコードはそのまま返す（例外にしない） */
function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** PostalAddress → 1 行の住所 */
export function addressToString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!isRecord(value)) return null;
  const parts = [str(value.addressRegion), str(value.addressLocality), str(value.streetAddress)].filter((p): p is string => p !== null);
  const postal = str(value.postalCode);
  if (parts.length === 0) return null;
  return `${postal ? `〒${postal} ` : ""}${parts.join("")}`.trim();
}

function typesOf(value: unknown): string[] {
  const t = isRecord(value) ? value["@type"] : null;
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
}

/** JSON-LD（@graph も辿る）から Organization / LocalBusiness 系を集める */
export function organizationsFromJsonLd(payload: unknown): JsonLdOrg[] {
  const out: JsonLdOrg[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 4) return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    if (!isRecord(node)) return;
    const types = typesOf(node);
    const orgType = types.find((t) => ORG_TYPE_RE.test(t.replace(/^.*[/:]/, "")));
    if (orgType) {
      out.push({
        type: orgType,
        name: str(node.name) ?? (isRecord(node.name) ? str(node.name.name) : null),
        telephone: str(node.telephone),
        address: addressToString(node.address),
        url: str(node.url),
      });
    }
    if (Array.isArray(node["@graph"])) visit(node["@graph"], depth + 1);
    for (const key of ["publisher", "provider", "organization", "parentOrganization", "location", "mainEntity"]) {
      if (node[key] !== undefined) visit(node[key], depth + 1);
    }
  };
  visit(payload, 0);
  return out;
}

/** 番地のあとは空白区切りで 2 語まで（建物名 + 階）。その先は会社名や案内文であることが多い */
function trimAddressTail(value: string): string {
  const cut = value.replace(ADDRESS_STOP, "").replace(/\s+/g, " ").trim();
  const first = cut.search(/[0-9]/);
  if (first < 0) return cut;
  const tail = cut.slice(first);
  const m = /^[^\s]+(?:\s[^\s]+){0,2}/.exec(tail);
  return `${cut.slice(0, first)}${m ? m[0] : tail}`.trim();
}

export function extractAddresses(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of text.normalize("NFKC").matchAll(ADDRESS_RE)) {
    const v = trimAddressTail(m[0]);
    if (v.length < 6 || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export function extractNap(html: string, pageUrl: string): ExtractedNap {
  const $ = cheerio.load(html || "");
  const jsonLd: JsonLdOrg[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      jsonLd.push(...organizationsFromJsonLd(JSON.parse($(el).text())));
    } catch {
      // 壊れた JSON-LD はサイト監視が別に知らせる
    }
  });

  const names = new Set<string>();
  for (const o of jsonLd) if (o.name) names.add(o.name);
  const siteName = $('meta[property="og:site_name"]').attr("content")?.trim();
  if (siteName) names.add(siteName);

  const body = $("body").clone();
  body.find("script, style, noscript, template, svg").remove();
  const footerText = $("footer, [role=contentinfo], #footer, .footer").text().replace(/\s+/g, " ").trim();
  const text = body.text().replace(/\s+/g, " ").trim();
  const copyright = /(?:©|&copy;|\(c\)|copyright)\s*(?:\d{4}(?:\s*[-–]\s*\d{4})?)?\s*([^\s©]{2,40}?)(?:\.|\s|all rights|$)/i.exec(`${footerText} ${text}`.normalize("NFKC"));
  if (copyright?.[1]) names.add(copyright[1].replace(/\.$/, ""));
  const title = ($("title").first().text() || "").split(/[|｜\-–—]/)[0].trim();
  if (title && title.length <= 40) names.add(title);

  const phones = new Set<string>();
  $('a[href^="tel:"]').each((_, el) => {
    for (const d of phoneCandidates(safeDecode(($(el).attr("href") ?? "").slice(4)))) phones.add(d);
  });
  for (const d of phoneCandidates(`${footerText} ${text}`)) phones.add(d);

  const addresses = new Set<string>();
  for (const o of jsonLd) if (o.address) addresses.add(o.address);
  for (const a of extractAddresses(`${footerText}\n${text}`)) addresses.add(a);

  const candidates = new Map<string, { url: string; text: string; score: number }>();
  let host = "";
  try {
    host = new URL(pageUrl).hostname;
  } catch {
    host = "";
  }
  const external = new Map<string, string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    const abs = absoluteUrl(href, pageUrl);
    if (!abs) return;
    try {
      const linkHost = new URL(abs).hostname;
      if (linkHost !== host) {
        if (!external.has(linkHost) && external.size < MAX_EXTERNAL_LINKS) external.set(linkHost, abs);
        return;
      }
    } catch {
      return;
    }
    const label = $(el).text().replace(/\s+/g, " ").trim().slice(0, 40);
    const path = safeDecode(new URL(abs).pathname);
    let score = 0;
    for (const [re, weight] of PAGE_HINTS) if (re.test(label) || re.test(path)) score = Math.max(score, weight);
    if (score === 0) return;
    const cur = candidates.get(abs);
    if (!cur || cur.score < score) candidates.set(abs, { url: abs, text: label || path, score });
  });

  return {
    jsonLd,
    phones: [...phones].slice(0, MAX_ITEMS),
    addresses: [...addresses].slice(0, MAX_ITEMS),
    names: [...names].slice(0, MAX_ITEMS),
    text: `${footerText} ${text}`.slice(0, 200_000),
    candidatePages: [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 8),
    externalLinks: [...external.values()],
  };
}
