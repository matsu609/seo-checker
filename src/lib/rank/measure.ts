/**
 * SERP の生結果 → 順位計測の 1 行（純関数）。
 *
 * 1 キーワードにつき SERP は 1 回しか呼ばない。自社も競合も AI Overviews も
 * 同じレスポンスから読むため、ドメイン照合はすべてここで行う。
 */
import type { SerpOrganicResult, SerpResult } from "@/lib/serp/types";
import { normalizeDomain } from "@/lib/store/projects";
import type { AioReference, AioSnapshot, CompetitorRank, RankMeasurement } from "./types";
import { MAX_RANK } from "./types";

/** URL → www. を除いた小文字ホスト名。読めない URL は空文字 */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** ホスト名がドメインに一致するか（サブドメインも自社扱い） */
export function matchesDomain(host: string, domain: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  const d = normalizeDomain(domain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/** URL がいずれかのドメインのものか */
export function matchesAnyDomain(url: string, domains: readonly string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return domains.some((d) => matchesDomain(host, d));
}

export interface FoundRank {
  rank: number | null;
  url: string | null;
  title: string | null;
}

/**
 * organic の中で最も上位にあるそのドメインの結果。
 * 100 位より下（num=100 で取り切れない位置）は圏外として扱う。
 */
export function findRank(organic: readonly SerpOrganicResult[], domains: readonly string[]): FoundRank {
  let best: SerpOrganicResult | null = null;
  for (const item of organic) {
    if (!matchesAnyDomain(item.url, domains)) continue;
    if (!Number.isFinite(item.position) || item.position < 1) continue;
    if (!best || item.position < best.position) best = item;
  }
  if (!best || best.position > MAX_RANK) return { rank: null, url: null, title: null };
  return { rank: best.position, url: best.url, title: best.title };
}

/** AI Overviews の引用元 → 画面・保存用の形（ホスト名を添える） */
export function toReferences(result: SerpResult): AioReference[] {
  const refs = result.aiOverview?.references ?? [];
  const seen = new Set<string>();
  const out: AioReference[] = [];
  for (const r of refs) {
    const key = r.url.replace(/[#?].*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: r.url, title: r.title || r.source || r.url, domain: hostOf(r.url) });
  }
  return out;
}

export interface MeasureOptions {
  projectDomain: string;
  competitorDomains?: readonly string[];
  /** AIO 本文も含める（リアルタイム計測・トピック分析用） */
  includeAioText?: boolean;
  location?: string;
}

/** AI Overviews の状態を取り出す（自社・競合の引用判定込み） */
export function measureAioOverview(result: SerpResult, options: MeasureOptions): AioSnapshot {
  // AIO は出ていたが本文・引用を取得できなかったときは「表示なし」にしない。
  // 未取得として返し、5 区分の分母から外す（実装ガイド §5.1）
  if (result.aiOverviewUnavailable && !result.aiOverview) {
    return { present: true, unavailable: true, selfCited: false, competitorCited: false, references: [] };
  }
  const references = toReferences(result);
  const present = Boolean(result.aiOverview);
  const selfCited = present && references.some((r) => matchesDomain(r.domain, options.projectDomain));
  const citedCompetitors = (options.competitorDomains ?? []).filter((d) =>
    references.some((r) => matchesDomain(r.domain, d)),
  );
  const snapshot: AioSnapshot = {
    present,
    selfCited,
    competitorCited: citedCompetitors.length > 0,
    references,
    ...(citedCompetitors.length > 0 ? { citedCompetitors: [...citedCompetitors] } : {}),
  };
  if (options.includeAioText && result.aiOverview?.text) snapshot.text = result.aiOverview.text;
  return snapshot;
}

/** SERP 1 回分 → 自社順位・競合順位・AIO・SERP フィーチャー */
export function measureFromSerp(result: SerpResult, options: MeasureOptions): RankMeasurement {
  const self = findRank(result.organic, [options.projectDomain]);
  const competitors: CompetitorRank[] = (options.competitorDomains ?? []).map((domain) => {
    const found = findRank(result.organic, [domain]);
    return { domain, rank: found.rank, url: found.url, title: found.title };
  });
  return {
    keyword: result.query,
    device: result.device,
    ...(options.location ? { location: options.location } : {}),
    rank: self.rank,
    url: self.url,
    title: self.title,
    competitors,
    aiOverview: measureAioOverview(result, options),
    features: result.features,
    totalResults: result.totalResults,
    fetchedAt: result.fetchedAt,
  };
}

/**
 * 同時実行数を絞って順に処理する。1 件の失敗で全体を落とさず、
 * 呼び出し側が「行ごとのエラー」を返せるように結果は入力順で戻す。
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.min(limit, items.length || 1));
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: size }, () => next()));
  return out;
}
