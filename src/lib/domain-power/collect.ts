/**
 * ドメインパワーのうち「外に取りに行く分」の収集。サーバー専用。
 *
 * RDAP（登録日）と Open PageRank（外部リンクの評価）を、自社と競合の分だけ
 * まとめて取る。どちらも失敗しても例外にせず notes に残す（報告書を止めない）。
 * 検索順位・CrUX・クロールの数値は呼び出し側（パワーアップ分析の収集）が
 * すでに持っているので、ここでは触らない。
 */
import { ageYearsFrom, registrableDomain } from "./domain";
import { fetchOpenPageRank } from "./openpagerank";
import { fetchRdapDomain } from "./rdap";
import type { DomainPowerPeer } from "./types";

export interface DomainFacts {
  host: string;
  registeredAt: string | null;
  registrar: string | null;
  openPageRank: number | null;
  openPageRankWorldRank: number | null;
  peers: DomainPowerPeer[];
  notes: string[];
  sources: { rdap: boolean; openPageRank: boolean };
}

export interface FetchDomainFactsOptions {
  signal?: AbortSignal;
}

/**
 * 自社（origin）と競合（competitors）の登録ドメインについて、
 * 登録日と Open PageRank を取る。競合はこの 2 つだけ（クロールしないため）。
 */
export async function fetchDomainFacts(
  origin: string,
  competitors: readonly string[] = [],
  options: FetchDomainFactsOptions = {},
): Promise<DomainFacts> {
  const host = registrableDomain(origin);
  const peerHosts = [...new Set(competitors.map(registrableDomain).filter((h) => h && h !== host))];
  const notes: string[] = [];

  const [opr, rdap, peerRdap] = await Promise.all([
    fetchOpenPageRank([host, ...peerHosts], options),
    fetchRdapDomain(host, options),
    Promise.all(peerHosts.map((h) => fetchRdapDomain(h, options))),
  ]);

  if (opr.failure && opr.message) notes.push(opr.message);
  if (rdap.failure && rdap.message) notes.push(`ドメインの登録日: ${rdap.message}`);

  const oprOf = (domain: string): { rank: number | null; worldRank: number | null } => {
    const hit = opr.entries.find((e) => e.domain === domain);
    return { rank: hit?.rank ?? null, worldRank: hit?.worldRank ?? null };
  };
  const own = oprOf(host);

  const peers: DomainPowerPeer[] = peerHosts.map((h, i) => {
    const registeredAt = peerRdap[i]?.result?.registeredAt ?? null;
    return { host: h, openPageRank: oprOf(h).rank, registeredAt, ageYears: ageYearsFrom(registeredAt) };
  });

  return {
    host,
    registeredAt: rdap.result?.registeredAt ?? null,
    registrar: rdap.result?.registrar ?? null,
    openPageRank: own.rank,
    openPageRankWorldRank: own.worldRank,
    peers,
    notes,
    sources: { rdap: rdap.result?.registeredAt != null, openPageRank: own.rank !== null },
  };
}
