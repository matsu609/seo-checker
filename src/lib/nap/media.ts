/**
 * 掲載ページ（登録済みの URL）とウェブ検索で見つかったページの NAP を確かめる（サーバー専用）。
 *
 * - 掲載ページ: 「掲載」タブで控えた各媒体の URL（listing_profiles.states[*].url）を開き、本文の店名・電話・住所を見る
 * - ウェブ検索: DataForSEO で「店名 + 電話」「店名 + 住所」を検索し、既知の媒体（地図・ディレクトリ・口コミ）の
 *   ページを最大 6 件開いて同じように見る。Apple マップ・Google マップは JS 描画で本文が取れないので開かない
 *
 * 1 ページずつ順に開く（相手先への負荷を抑える）。締め切りを過ぎたら残りは飛ばす。
 */
import { buildQueries, classifyHost, hostOf, mergeHits, ownHostOf, pathOf, type QueryOutcome } from "@/lib/citations/analyze";
import { CitationError, searchGoogle } from "@/lib/citations/dataforseo";
import { isDataForSeoConfigured } from "@/lib/geo/dataforseo";
import { listListings } from "@/lib/listings/store";
import { mediaById } from "@/lib/listings/media";
import { compareAddress, comparePhone, nameInText, websiteInLinks } from "./compare";
import { extractNap } from "./extract";
import { defaultFetchPage, type PageFetcher } from "./site";
import type { FieldCheck, NapInput, NapSource, NapSourceKind } from "./types";

/** ウェブ検索から開くページの上限 */
export const MAX_WEB_PAGES = 6;
/** 本文が JS で描かれ、HTML を取っても NAP が入っていないホスト（開かない） */
const JS_ONLY_HOSTS = ["maps.apple.com", "google.com", "google.co.jp", "goo.gl", "maps.app.goo.gl", "facebook.com", "instagram.com", "x.com", "twitter.com"];

export interface ListingPage {
  mediaId: string;
  mediaName: string;
  url: string;
}

function fetchErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "ページを取得できませんでした";
}

/** 1 ページの本文を入力と突き合わせる（掲載ページ・検索で見つけたページ共通） */
export async function checkPage(input: NapInput, kind: NapSourceKind, label: string, url: string, fetchPage: PageFetcher): Promise<NapSource> {
  try {
    const page = await fetchPage(url);
    if (page.status >= 400 || !page.html.trim()) {
      return { kind, label, url, fields: [], error: `ページを取得できませんでした（HTTP ${page.status}）` };
    }
    const extracted = extractNap(page.html, page.finalUrl || url);
    const fields: FieldCheck[] = [
      nameInText(input.name, `${extracted.names.join(" ")} ${extracted.text}`),
      compareAddress(input.address, extracted.addresses),
      comparePhone(input.phone, extracted.phones),
      // 媒体のページに自社サイトへのリンクがあるか（JSON-LD の url か、外部リンク）
      websiteInLinks(input.website, [...extracted.jsonLd.map((o) => o.url ?? "").filter(Boolean), ...extracted.externalLinks]),
    ];
    return { kind, label, url, fields, error: null };
  } catch (err) {
    return { kind, label, url, fields: [], error: fetchErrorMessage(err) };
  }
}

/** 「掲載」タブで控えた掲載ページ（URL があるものだけ） */
export async function listListingPages(userId: string): Promise<ListingPage[]> {
  const out: ListingPage[] = [];
  const seen = new Set<string>();
  for (const record of await listListings(userId)) {
    for (const [mediaId, state] of Object.entries(record.states)) {
      const url = state.url.trim();
      if (!url || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      out.push({ mediaId, mediaName: mediaById(mediaId)?.name ?? mediaId, url });
    }
  }
  return out;
}

export async function checkListingPages(input: NapInput, pages: readonly ListingPage[], fetchPage: PageFetcher = defaultFetchPage, deadline = Date.now() + 60_000): Promise<NapSource[]> {
  const sources: NapSource[] = [];
  for (const p of pages) {
    if (Date.now() > deadline) {
      sources.push({ kind: "listing", label: p.mediaName, url: p.url, fields: [], error: "時間切れのため確認していません（もう一度実行してください）" });
      continue;
    }
    sources.push(await checkPage(input, "listing", p.mediaName, p.url, fetchPage));
  }
  return sources;
}

export interface WebPage {
  url: string;
  label: string;
}

/** 検索結果から「開く価値のある」ページを選ぶ（既知の媒体を優先。自社サイト・JS 描画のホストは除く） */
export function pickWebPages(input: NapInput, outcomes: readonly QueryOutcome[], exclude: ReadonlySet<string> = new Set()): WebPage[] {
  const ownHost = ownHostOf(input.website);
  const hits = mergeHits(input, outcomes).filter((h) => h.kind !== "own");
  const out: WebPage[] = [];
  for (const h of hits) {
    if (exclude.has(h.url)) continue;
    const host = hostOf(h.url);
    if (!host || JS_ONLY_HOSTS.some((j) => host === j || host.endsWith(`.${j}`))) continue;
    const cls = classifyHost(host, pathOf(h.url), ownHost);
    const known = cls.kind !== "other";
    // 既知の媒体は無条件、その他は電話か住所が検索結果の文中で確認できたページだけ（無関係なページを開かない）
    if (!known && h.phone === "absent" && h.address !== "match") continue;
    out.push({ url: h.url, label: cls.sourceLabel ? `${cls.sourceLabel}（${host}）` : host });
    if (out.length >= MAX_WEB_PAGES) break;
  }
  return out;
}

export interface WebCheckResult {
  sources: NapSource[];
  note: string | null;
  /** 使った検索の数 */
  searches: number;
}

export interface WebSearch {
  configured: () => boolean;
  search: (q: string, signal?: AbortSignal) => Promise<QueryOutcome["hits"]>;
}

export const defaultWebSearch: WebSearch = {
  configured: isDataForSeoConfigured,
  search: (q, signal) => searchGoogle(q, { signal }),
};

/** DataForSEO で検索して、見つかった媒体のページを開く */
export async function checkWebPages(
  input: NapInput,
  exclude: ReadonlySet<string>,
  options: { web?: WebSearch; fetchPage?: PageFetcher; deadline?: number; signal?: AbortSignal } = {},
): Promise<WebCheckResult> {
  const web = options.web ?? defaultWebSearch;
  const fetchPage = options.fetchPage ?? defaultFetchPage;
  const deadline = options.deadline ?? Date.now() + 60_000;
  if (!web.configured()) {
    return { sources: [], note: "ウェブ検索での掲載ページの発見は行っていません（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD が未設定）。「掲載」タブで控えた URL は確認します", searches: 0 };
  }
  // 電話・住所の検索だけ使う（店名だけの検索は無関係なページが多い）
  const queries = buildQueries(input).filter((q) => q.q && q.id !== "name");
  if (queries.length === 0) return { sources: [], note: "電話番号と住所が空のため、ウェブ検索は行っていません", searches: 0 };
  const outcomes: QueryOutcome[] = [];
  const errors: string[] = [];
  for (const q of queries) {
    try {
      outcomes.push({ id: q.id, hits: await web.search(q.q, options.signal), error: null });
    } catch (err) {
      errors.push(err instanceof CitationError ? err.message : "検索中にエラーが発生しました");
    }
  }
  if (outcomes.length === 0) return { sources: [], note: `ウェブ検索に失敗しました（${errors[0] ?? "不明なエラー"}）`, searches: queries.length };
  const pages = pickWebPages(input, outcomes, exclude);
  const sources: NapSource[] = [];
  for (const p of pages) {
    if (Date.now() > deadline) {
      sources.push({ kind: "web", label: p.label, url: p.url, fields: [], error: "時間切れのため確認していません（もう一度実行してください）" });
      continue;
    }
    sources.push(await checkPage(input, "web", p.label, p.url, fetchPage));
  }
  const note = errors.length > 0 ? `ウェブ検索の一部に失敗しました（${errors[0]}）` : pages.length === 0 ? "ウェブ検索では、電話番号か住所が入力と一致する掲載ページは見つかりませんでした（検索結果の短い文の中で見ています）" : null;
  return { sources, note, searches: queries.length };
}
