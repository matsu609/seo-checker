/**
 * 自社サイトの NAP を確かめる（サーバー専用。ネットワークに出る）。
 *
 * 1. トップページを取り、構造化データ（JSON-LD）と、フッター・本文の店名・電話・住所を抜く
 * 2. 会社概要・お問い合わせ・アクセスなどのページ（最大 4 ページ）も同じように見る
 * 3. 構造化データは「1 つの媒体」として、各ページは「ページごと」に一致 / 不一致 / 記載なし を返す
 *
 * 取れないページは error に理由を入れて返す（診断全体は止めない）。
 */
import { fetchText, FetchError, normalizeUrl as toFetchUrl } from "@/lib/analyzer/fetch";
import { compareAddress, compareName, comparePhone, compareWebsite, nameInText, phoneDigits, skipped } from "./compare";
import { extractNap, type ExtractedNap, type JsonLdOrg } from "./extract";
import type { FieldCheck, NapInput, NapSource } from "./types";

/** トップ以外に見るページの数 */
export const MAX_SUB_PAGES = 4;
const PAGE_TIMEOUT_MS = 12_000;
const PAGE_MAX_BYTES = 2 * 1024 * 1024;

export interface FetchedPage {
  url: string;
  finalUrl: string;
  status: number;
  html: string;
}

export type PageFetcher = (url: string) => Promise<FetchedPage>;

/** 既定の取得（SSRF 対策つきの fetchText） */
export const defaultFetchPage: PageFetcher = async (url) => {
  const res = await fetchText(url, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: PAGE_MAX_BYTES });
  return { url, finalUrl: res.finalUrl, status: res.status, html: res.body };
};

function fetchErrorMessage(err: unknown): string {
  if (err instanceof FetchError) return err.message;
  if (err instanceof Error && err.name === "AbortError") return "取得がタイムアウトしました";
  return "ページを取得できませんでした";
}

function pageLabel(url: string, text: string | null, isTop: boolean): string {
  if (isTop) return "トップページ";
  if (text && text.trim()) return text.trim().slice(0, 30);
  try {
    return decodeURIComponent(new URL(url).pathname) || url;
  } catch {
    return url;
  }
}

/** 構造化データ（JSON-LD）の 1 件を入力と突き合わせる */
export function checkJsonLd(input: NapInput, orgs: readonly JsonLdOrg[], pageUrl: string): NapSource | null {
  if (orgs.length === 0) return null;
  const fields: FieldCheck[] = [
    compareName(input.name, orgs.map((o) => o.name ?? "").filter(Boolean)),
    compareAddress(input.address, orgs.map((o) => o.address ?? "").filter(Boolean)),
    comparePhone(input.phone, orgs.map((o) => o.telephone ?? "").filter(Boolean).map(phoneDigits)),
    compareWebsite(input.website, orgs.map((o) => o.url ?? "").filter(Boolean)),
  ];
  const types = [...new Set(orgs.map((o) => o.type))].join(" / ");
  return { kind: "site_jsonld", label: `構造化データ（${types}）`, url: pageUrl, fields, error: null };
}

/** ページ本文（フッター・会社概要など）を入力と突き合わせる。サイト URL は自分のページなので比べない */
export function checkPageText(input: NapInput, extracted: ExtractedNap, pageUrl: string, label: string): NapSource {
  const fields: FieldCheck[] = [
    nameInText(input.name, `${extracted.names.join(" ")} ${extracted.text}`),
    compareAddress(input.address, extracted.addresses),
    comparePhone(input.phone, extracted.phones),
    skipped("website", input.website),
  ];
  return { kind: "site_page", label, url: pageUrl, fields, error: null };
}

export interface OwnSiteResult {
  sources: NapSource[];
  /** トップページに構造化データ（Organization / LocalBusiness 系）があったか */
  hasJsonLd: boolean;
  /** 見たページ数（取得できたもの） */
  pagesChecked: number;
}

/** 自社サイトを見る。website が空なら何もしない */
export async function checkOwnSite(input: NapInput, fetchPage: PageFetcher = defaultFetchPage, deadline = Date.now() + 60_000): Promise<OwnSiteResult> {
  const sources: NapSource[] = [];
  let startUrl: string;
  try {
    startUrl = toFetchUrl(input.website).toString();
  } catch (err) {
    sources.push({ kind: "site_page", label: "トップページ", url: null, fields: [], error: fetchErrorMessage(err) });
    return { sources, hasJsonLd: false, pagesChecked: 0 };
  }

  let top: FetchedPage;
  try {
    top = await fetchPage(startUrl);
  } catch (err) {
    sources.push({ kind: "site_page", label: "トップページ", url: startUrl, fields: [], error: fetchErrorMessage(err) });
    return { sources, hasJsonLd: false, pagesChecked: 0 };
  }
  if (top.status >= 400 || !top.html.trim()) {
    sources.push({ kind: "site_page", label: "トップページ", url: startUrl, fields: [], error: `ページを取得できませんでした（HTTP ${top.status}）` });
    return { sources, hasJsonLd: false, pagesChecked: 0 };
  }

  const extractedTop = extractNap(top.html, top.finalUrl || startUrl);
  const jsonLd = checkJsonLd(input, extractedTop.jsonLd, top.finalUrl || startUrl);
  const seenJsonLd = new Set<string>();
  if (jsonLd) {
    sources.push(jsonLd);
    seenJsonLd.add(JSON.stringify(extractedTop.jsonLd));
  }
  sources.push(checkPageText(input, extractedTop, top.finalUrl || startUrl, "トップページ"));
  let pagesChecked = 1;

  const seen = new Set<string>([startUrl, top.finalUrl]);
  const candidates = extractedTop.candidatePages.filter((c) => !seen.has(c.url)).slice(0, MAX_SUB_PAGES);
  for (const c of candidates) {
    if (Date.now() > deadline) break;
    seen.add(c.url);
    try {
      const page = await fetchPage(c.url);
      if (page.status >= 400 || !page.html.trim()) {
        sources.push({ kind: "site_page", label: pageLabel(c.url, c.text, false), url: c.url, fields: [], error: `ページを取得できませんでした（HTTP ${page.status}）` });
        continue;
      }
      const extracted = extractNap(page.html, page.finalUrl || c.url);
      // 下層ページにだけある構造化データ（会社概要に Organization を置くサイト）も見る。トップと同じものは二重に出さない
      const key = JSON.stringify(extracted.jsonLd);
      if (extracted.jsonLd.length > 0 && !seenJsonLd.has(key)) {
        const sub = checkJsonLd(input, extracted.jsonLd, page.finalUrl || c.url);
        if (sub) {
          sources.push(sub);
          seenJsonLd.add(key);
        }
      }
      sources.push(checkPageText(input, extracted, page.finalUrl || c.url, pageLabel(c.url, c.text, false)));
      pagesChecked += 1;
    } catch (err) {
      sources.push({ kind: "site_page", label: pageLabel(c.url, c.text, false), url: c.url, fields: [], error: fetchErrorMessage(err) });
    }
  }

  return { sources, hasJsonLd: extractedTop.jsonLd.length > 0, pagesChecked };
}
