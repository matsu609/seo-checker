/**
 * 検索順位（SEO）の「自然検索の並び」を計測に持たせる（純関数。2026-09-23）。
 *
 * **なぜ要るか**: `geo_measurements` は顧客をまたいで共有するキャッシュ（§7.1）なので、
 * 計測の時点では「誰のドメインの順位か」を決められない。以前は計測のときに
 * 対象ドメインを渡しておらず（`parseSerpResult(payload)`）、順位が必ず null になって
 * **全キーワードが「圏外」と表示されていた**。
 *
 * そこで順位計測（kind = "rank"）では、自然検索の上位のドメインと順位を計測に残し、
 * 順位は**集計のときに利用者ごとのドメインで引く**。表を増やさないため、既存の
 * `citations` 列（jsonb）に `{ items: 引用, organic: 自然検索 }` の形で一緒に入れる
 * （引用だけの計測は従来どおり配列のまま）。
 */
import { normalizeDomain } from "./normalize";
import type { GeoCitation, OrganicHit } from "./types";

export type { OrganicHit };

/**
 * 自然検索の並びを整える。ドメインごとに最上位だけを残し、順位の昇順に並べる。
 * サブドメイン判定はドメイン単位で行うので、同じドメインの 2 件目以降は要らない（保存量を抑える）。
 */
export function compactOrganic(hits: readonly OrganicHit[]): OrganicHit[] {
  const best = new Map<string, number>();
  for (const h of hits) {
    const domain = normalizeDomain(h.domain);
    if (!domain || !Number.isFinite(h.rank) || h.rank < 1) continue;
    const cur = best.get(domain);
    if (cur === undefined || h.rank < cur) best.set(domain, h.rank);
  }
  return [...best.entries()].map(([domain, rank]) => ({ domain, rank })).sort((a, b) => a.rank - b.rank);
}

/**
 * 利用者のドメイン（サブドメインを含む）がいちばん上に出た順位。出ていなければ null（圏外）。
 */
export function rankForDomains(organic: readonly OrganicHit[], domains: readonly string[]): number | null {
  const targets = domains.map(normalizeDomain).filter(Boolean);
  if (targets.length === 0) return null;
  let best: number | null = null;
  for (const hit of organic) {
    if (!targets.some((d) => hit.domain === d || hit.domain.endsWith(`.${d}`))) continue;
    if (best === null || hit.rank < best) best = hit.rank;
  }
  return best;
}

/** `citations` 列に書く形。自然検索の並びがあるとき（順位計測）だけ包む */
export function encodeStoredCitations(citations: readonly GeoCitation[], organic: readonly OrganicHit[] | null): unknown {
  return organic ? { items: citations, organic } : citations;
}

/**
 * `citations` 列を読む。**`organic` が null = 並びを保存していない計測**
 * （2026-09-23 より前の順位計測、または順位計測以外）。空配列（上位に 1 件も無かった）とは区別する。
 */
export function decodeStoredCitations(raw: unknown): { citations: GeoCitation[]; organic: OrganicHit[] | null } {
  if (Array.isArray(raw)) return { citations: raw as GeoCitation[], organic: null };
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    const citations = Array.isArray(record.items) ? (record.items as GeoCitation[]) : [];
    if (!Array.isArray(record.organic)) return { citations, organic: null };
    const organic: OrganicHit[] = [];
    for (const row of record.organic) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (typeof r.domain === "string" && typeof r.rank === "number") organic.push({ domain: r.domain, rank: r.rank });
    }
    return { citations, organic };
  }
  return { citations: [], organic: null };
}
