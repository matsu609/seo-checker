/**
 * 登録サイトと Google マップの表記ゆれ（NAP 整合）を調べる。精密診断のみ。
 *
 * NAP = Name / Address / Phone。同じ店舗の情報がサイトと Google で食い違っていると、
 * Google は同一の店舗だと確信を持てず、順位にも表示にも効いてくる。自分のクローラで
 * 登録サイトを 1 ページ読むだけなので、追加の API 費用はゼロ（利用者の決定 2026-09-13）。
 *
 * 取り方は 2 段構え:
 *   1. JSON-LD（LocalBusiness / Organization など）の name / telephone / address
 *   2. 見つからなければ本文から拾う（電話番号は日本の表記、住所は都道府県から始まる行）
 * 比較は基本情報掲載と同じ正規化（src/lib/listings/profile.ts の normalizeForCompare）。
 */
import * as cheerio from "cheerio";
import { normalizeForCompare } from "@/lib/listings/profile";
import type { PlaceDetail } from "./types";

export type NapField = "name" | "address" | "phone";
export type NapStatus = "match" | "mismatch" | "missing";

export interface NapFinding {
  field: NapField;
  label: string;
  status: NapStatus;
  /** Google マップ側の値 */
  google: string | null;
  /** サイト側で見つかった値 */
  site: string | null;
  /** どこから取ったか */
  source: "json-ld" | "本文" | null;
}

export interface NapResult {
  /** 調べたページ */
  url: string;
  checkedAt: string;
  findings: NapFinding[];
  /** 食い違いの件数 */
  mismatches: number;
}

/** サイトから読み取った NAP */
export interface SiteNap {
  name: { value: string; source: "json-ld" | "本文" } | null;
  address: { value: string; source: "json-ld" | "本文" } | null;
  phone: { value: string; source: "json-ld" | "本文" } | null;
}

const PREFECTURES =
  "北海道|青森県|岩手県|宮城県|秋田県|山形県|福島県|茨城県|栃木県|群馬県|埼玉県|千葉県|東京都|神奈川県|新潟県|富山県|石川県|福井県|山梨県|長野県|岐阜県|静岡県|愛知県|三重県|滋賀県|京都府|大阪府|兵庫県|奈良県|和歌山県|鳥取県|島根県|岡山県|広島県|山口県|徳島県|香川県|愛媛県|高知県|福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県";
/** 日本の電話番号（市外局番 2〜4 桁 + 区切り）。フリーダイヤルも拾う */
const PHONE_RE = /0(?:\d{1,4}[-‐－ー−(（\s]?\d{1,4}[-‐－ー−)）\s]?\d{3,4}|120[-\s]?\d{2,3}[-\s]?\d{3,4})/;

function text(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

/** JSON-LD のノードを再帰でたどる */
function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  visit(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") walk(value, visit);
  }
}

/** JSON-LD の address（文字列 or PostalAddress）を 1 行にする */
function addressOf(node: Record<string, unknown>): string | null {
  const addr = node.address;
  if (typeof addr === "string") return text(addr);
  if (!addr || typeof addr !== "object") return null;
  const a = addr as Record<string, unknown>;
  const parts = [a.postalCode, a.addressRegion, a.addressLocality, a.streetAddress].map(text).filter((v): v is string => v !== null);
  return parts.length > 0 ? parts.join(" ") : null;
}

/** HTML から店名・住所・電話を読み取る（JSON-LD を優先） */
export function extractSiteNap(html: string): SiteNap {
  const $ = cheerio.load(html);
  const out: SiteNap = { name: null, address: null, phone: null };

  $('script[type="application/ld+json"]').each((_, el) => {
    let data: unknown;
    try {
      data = JSON.parse($(el).text());
    } catch {
      return;
    }
    walk(data, (node) => {
      const t = node["@type"];
      const types = (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
      // 店舗・組織を表すノードだけ見る（BreadcrumbList などは無視）
      if (!types.some((name) => /Business|Organization|Store|Restaurant|Place|Clinic|Shop/i.test(name))) return;
      if (!out.name) {
        const v = text(node.name);
        if (v) out.name = { value: v, source: "json-ld" };
      }
      if (!out.phone) {
        const v = text(node.telephone);
        if (v) out.phone = { value: v, source: "json-ld" };
      }
      if (!out.address) {
        const v = addressOf(node);
        if (v) out.address = { value: v, source: "json-ld" };
      }
    });
  });

  const body = $("body").text().replace(/[\t\r]+/g, " ");
  if (!out.phone) {
    const m = body.match(PHONE_RE);
    if (m) out.phone = { value: m[0].trim(), source: "本文" };
  }
  if (!out.address) {
    const m = body.match(new RegExp(`(?:〒\\s?\\d{3}-?\\d{4}\\s*)?(?:${PREFECTURES})[^\\n。、]{3,60}`));
    if (m) out.address = { value: m[0].replace(/\s+/g, " ").trim(), source: "本文" };
  }
  if (!out.name) {
    const title = text($("title").first().text());
    // タイトルは「店名 | キャッチコピー」の形が多いので区切りの前だけ使う
    if (title) out.name = { value: title.split(/[|｜\-–—・]/)[0].trim(), source: "本文" };
  }
  return out;
}

const LABELS: Record<NapField, string> = { name: "店名", address: "住所", phone: "電話番号" };

/** 住所は Google 側が「日本、〒…」を付けるので、どちらかがもう片方を含めば一致とみなす */
function same(field: NapField, a: string, b: string): boolean {
  const x = normalizeForCompare(a);
  const y = normalizeForCompare(b);
  if (x === y) return true;
  if (field === "address") return x.includes(y) || y.includes(x);
  if (field === "phone") return x.replace(/-/g, "") === y.replace(/-/g, "");
  // 店名はサイト側に支店名や装飾が付くことがあるので、含んでいれば一致とみなす
  return x.includes(y) || y.includes(x);
}

export function compareSiteNap(
  site: SiteNap,
  detail: Pick<PlaceDetail, "name" | "address" | "phone">,
  url: string,
  now = new Date(),
): NapResult {
  const google: Record<NapField, string | null> = { name: detail.name, address: detail.address, phone: detail.phone };
  const findings = (Object.keys(LABELS) as NapField[]).map((field) => {
    const found = site[field];
    const g = google[field];
    if (!found || !g) {
      return { field, label: LABELS[field], status: "missing" as const, google: g, site: found?.value ?? null, source: found?.source ?? null };
    }
    return {
      field,
      label: LABELS[field],
      status: same(field, found.value, g) ? ("match" as const) : ("mismatch" as const),
      google: g,
      site: found.value,
      source: found.source,
    };
  });
  return {
    url,
    checkedAt: now.toISOString(),
    findings,
    mismatches: findings.filter((f) => f.status === "mismatch").length,
  };
}
