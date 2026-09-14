/**
 * 検索での見え方（SerpApi）。サーバー専用。
 *
 * 対策キーワードごとの自社の順位・上位ドメイン・SERP の特徴・AI Overviews の引用、
 * `site:` 検索の概算件数、ブランド名検索での自社の順位を集める。
 * SERPAPI_KEY が無ければ何もせず notes に書く（ダミーは返さない）。
 * 1 回の分析でキーワード数 + 2 回の検索（実費は 1 回数円）。
 */
import { getSerpProvider, type SerpProvider, type SerpResult } from "@/lib/serp";
import type { SheetKeywordResult, SheetSearch } from "./sheet/types";

const MAX_KEYWORDS = 5;

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** 検索結果の中で、そのホスト（サブドメイン含む）の最初の順位 */
export function rankOf(result: SerpResult, host: string): { rank: number | null; url: string | null } {
  if (!host) return { rank: null, url: null };
  for (const r of result.organic) {
    const h = hostOf(r.url);
    if (h === host || h.endsWith(`.${host}`)) return { rank: r.position, url: r.url };
  }
  return { rank: null, url: null };
}

export function topDomains(result: SerpResult, count = 3): string[] {
  const out: string[] = [];
  for (const r of result.organic) {
    const h = hostOf(r.url);
    if (h && !out.includes(h)) out.push(h);
    if (out.length >= count) break;
  }
  return out;
}

/**
 * ブランド名の推定。入力があればそれ、無ければトップページの title の
 * 「｜」「|」「-」区切りの最後の要素（サイト名が来ることが多い）。
 */
export function guessBrand(input: string, homeTitle: string | null): string {
  const given = input.trim();
  if (given) return given;
  if (!homeTitle) return "";
  const parts = homeTitle.split(/\s*[|｜\-–—:：]\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  const last = parts[parts.length - 1];
  return last.length <= 30 ? last : "";
}

export interface CollectSearchArgs {
  origin: string;
  keywords: string[];
  competitors: string[];
  brand: string;
  homeTitle: string | null;
  region?: string;
  provider?: SerpProvider | null;
  signal?: AbortSignal;
}

export async function collectSearch(args: CollectSearchArgs): Promise<{ search: SheetSearch; enabled: boolean }> {
  const provider = args.provider === undefined ? getSerpProvider() : args.provider;
  const notes: string[] = [];
  if (!provider) {
    notes.push("検索順位は取得していません（SERPAPI_KEY が未設定）");
    return { search: { keywords: [], siteCount: null, brand: null, notes }, enabled: false };
  }
  const host = hostOf(args.origin);
  const competitorHosts = args.competitors.map(hostOf).filter(Boolean);
  const keywords = [...new Set(args.keywords.map((k) => k.trim()).filter(Boolean))].slice(0, MAX_KEYWORDS);

  const keywordResults: SheetKeywordResult[] = [];
  for (const keyword of keywords) {
    try {
      const result = await provider.search({ q: keyword, num: 100, device: "mobile" });
      const own = rankOf(result, host);
      const cited = result.aiOverview ? result.aiOverview.references.some((r) => hostOf(r.url) === host || hostOf(r.url).endsWith(`.${host}`)) : null;
      keywordResults.push({
        keyword,
        rank: own.rank,
        url: own.url,
        topDomains: topDomains(result),
        features: result.features,
        aiOverview: result.aiOverview !== null,
        ownCited: cited,
        competitors: competitorHosts.map((h) => ({ host: h, rank: rankOf(result, h).rank })),
      });
    } catch (err) {
      notes.push(`「${keyword}」の検索結果を取得できませんでした（${err instanceof Error ? err.message : "エラー"}）`);
    }
  }

  let siteCount: number | null = null;
  try {
    const site = await provider.search({ q: `site:${host}`, num: 10 });
    siteCount = site.totalResults;
  } catch {
    notes.push("site: 検索の件数を取得できませんでした");
  }

  let brand: SheetSearch["brand"] = null;
  const brandName = guessBrand(args.brand, args.homeTitle);
  if (brandName) {
    try {
      const result = await provider.search({ q: brandName, num: 20 });
      const own = rankOf(result, host);
      brand = { query: brandName, rank: own.rank, url: own.url };
    } catch {
      notes.push(`ブランド名「${brandName}」の検索結果を取得できませんでした`);
    }
  } else {
    notes.push("ブランド名を推定できなかったため、ブランド名検索は行っていません");
  }

  return { search: { keywords: keywordResults, siteCount, brand, notes }, enabled: true };
}
