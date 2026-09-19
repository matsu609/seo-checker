/**
 * ドメインパワーのうち「外に取りに行く分」の収集。サーバー専用。
 *
 * Ahrefs の DR（外部リンクの評価。無料の公開エンドポイント）、Open PageRank、
 * RDAP（登録日）を、自社と競合の分だけまとめて取る。どれも失敗しても例外に
 * せず notes に残す（報告書を止めない）。
 * 検索順位・CrUX・クロールの数値は呼び出し側（精密診断の収集）が
 * すでに持っているので、ここでは触らない。
 */
import { fetchAhrefsDr } from "./ahrefs";
import { ageYearsFrom, registrableDomain } from "./domain";
import { fetchOpenPageRank } from "./openpagerank";
import { fetchRdapDomain, type RdapOutcome } from "./rdap";
import { fetchJpRegisteredAt, isJpDomain } from "./whois-jp";
import type { DomainPowerPeer } from "./types";

export interface DomainFacts {
  host: string;
  registeredAt: string | null;
  registrar: string | null;
  /** Ahrefs の Domain Rating（0〜100） */
  ahrefsDr: number | null;
  /** Ahrefs の利用条件の URL（応答に付いてくる。帰属表示のリンク先） */
  ahrefsLicense: string | null;
  openPageRank: number | null;
  openPageRankWorldRank: number | null;
  peers: DomainPowerPeer[];
  notes: string[];
  sources: { ahrefs: boolean; rdap: boolean; openPageRank: boolean };
}

export interface FetchDomainFactsOptions {
  signal?: AbortSignal;
}

/**
 * 自社（origin）と競合（competitors）の登録ドメインについて、DR・Open PageRank・
 * 登録日を取る。競合はこの 3 つだけ（クロールしないため）。
 */
export async function fetchDomainFacts(
  origin: string,
  competitors: readonly string[] = [],
  options: FetchDomainFactsOptions = {},
): Promise<DomainFacts> {
  const host = registrableDomain(origin);
  const peerHosts = [...new Set(competitors.map(registrableDomain).filter((h) => h && h !== host))];
  const notes: string[] = [];

  const [opr, dr, peerDr, rdap, peerRdap] = await Promise.all([
    fetchOpenPageRank([host, ...peerHosts], options),
    fetchAhrefsDr(host, options),
    Promise.all(peerHosts.map((h) => fetchAhrefsDr(h, options))),
    fetchRegistration(host, options),
    Promise.all(peerHosts.map((h) => fetchRegistration(h, options))),
  ]);

  if (dr.failure && dr.message) notes.push(dr.message);
  if (opr.failure && opr.message) notes.push(opr.message);
  if (rdap.failure && rdap.message) notes.push(`ドメインの登録日: ${rdap.message}`);

  const oprOf = (domain: string): { rank: number | null; worldRank: number | null } => {
    const hit = opr.entries.find((e) => e.domain === domain);
    return { rank: hit?.rank ?? null, worldRank: hit?.worldRank ?? null };
  };
  const own = oprOf(host);

  const peers: DomainPowerPeer[] = peerHosts.map((h, i) => {
    const registeredAt = peerRdap[i]?.result?.registeredAt ?? null;
    return { host: h, ahrefsDr: peerDr[i]?.result?.rating ?? null, openPageRank: oprOf(h).rank, registeredAt, ageYears: ageYearsFrom(registeredAt) };
  });

  return {
    host,
    registeredAt: rdap.result?.registeredAt ?? null,
    registrar: rdap.result?.registrar ?? null,
    ahrefsDr: dr.result?.rating ?? null,
    ahrefsLicense: dr.result?.license ?? null,
    openPageRank: own.rank,
    openPageRankWorldRank: own.worldRank,
    peers,
    notes,
    sources: { ahrefs: dr.result?.rating != null, rdap: rdap.result?.registeredAt != null, openPageRank: own.rank !== null },
  };
}

/**
 * 登録日の取得。RDAP を先に見て、.jp で RDAP に無ければ JPRS の WHOIS で補う（2026-09-19）。
 * 戻りの形は RDAP と同じにして、呼び出し側の分岐を増やさない。
 */
async function fetchRegistration(domain: string, options: FetchDomainFactsOptions): Promise<RdapOutcome> {
  const rdap = await fetchRdapDomain(domain, options);
  if (rdap.result?.registeredAt || !isJpDomain(domain)) return rdap;
  const whois = await fetchJpRegisteredAt(domain, { signal: options.signal });
  if (whois.registeredAt) {
    return { result: { domain, registeredAt: whois.registeredAt, updatedAt: null, expiresAt: null, registrar: rdap.result?.registrar ?? null }, failure: null, message: null };
  }
  const failure: RdapOutcome["failure"] = rdap.failure ?? (whois.failure === "network" ? "network" : whois.failure ? "not-found" : null);
  return { result: rdap.result, failure, message: whois.message ?? rdap.message };
}

