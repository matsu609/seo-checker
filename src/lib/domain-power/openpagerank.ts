/**
 * Open PageRank（domcop）のクライアント。サーバー専用。
 *
 * Common Crawl のリンクグラフから算出された 0〜10 のドメイン評価を返す。
 * **このツールで唯一、外部からの被リンクを見ている指標**なので、
 * ドメインパワーの配点はここが一番大きい（25 点）。
 *
 * 無料枠で足りる（1 リクエストに最大 100 ドメイン、1 日 1,000 リクエスト）。
 * OPENPAGERANK_API_KEY が無ければ何もせず null を返す（ダミーは返さない）。
 */
import { globalCache } from "@/lib/cache";
import { isQueryableDomain } from "./domain";

export const OPR_ENDPOINT = "https://openpagerank.com/api/v1.0/getPageRank";
const TIMEOUT_MS = 10_000;
/** Open PageRank の更新は月 1 回程度なので長めに持つ */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** 1 回のリクエストで問い合わせるドメイン数の上限（API 側の上限は 100） */
export const MAX_DOMAINS = 20;

export interface OprEntry {
  domain: string;
  /** 0〜10。取得できなければ null */
  rank: number | null;
  /** 世界順位（小さいほど強い）。取得できなければ null */
  worldRank: number | null;
}

export type OprFailure = "no-key" | "upstream" | "network";

export interface OprOutcome {
  /** 問い合わせたドメインごとの結果（順不同。見つからないドメインは rank が null） */
  entries: OprEntry[];
  failure: OprFailure | null;
  message: string | null;
}

const cache = globalCache<OprEntry>("open-pagerank", CACHE_TTL_MS, 500);

export function openPageRankKey(): string | null {
  return process.env.OPENPAGERANK_API_KEY?.trim() || null;
}

export function isOpenPageRankEnabled(): boolean {
  return openPageRankKey() !== null;
}

/** API の応答（{ response: [{ domain, page_rank_decimal, rank }] }）を読む */
export function parseOpr(payload: unknown): OprEntry[] {
  if (typeof payload !== "object" || payload === null) return [];
  const rows = (payload as { response?: unknown }).response;
  if (!Array.isArray(rows)) return [];
  const out: OprEntry[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as { domain?: unknown; page_rank_decimal?: unknown; rank?: unknown; status_code?: unknown };
    if (typeof r.domain !== "string") continue;
    const found = r.status_code === 200;
    const decimal = typeof r.page_rank_decimal === "number" ? r.page_rank_decimal : Number(r.page_rank_decimal);
    const world = typeof r.rank === "number" ? r.rank : Number(r.rank);
    out.push({
      domain: r.domain.toLowerCase(),
      rank: found && Number.isFinite(decimal) ? decimal : null,
      worldRank: found && Number.isFinite(world) && world > 0 ? world : null,
    });
  }
  return out;
}

export interface OprOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function fetchOpenPageRank(domains: readonly string[], options: OprOptions = {}): Promise<OprOutcome> {
  const key = openPageRankKey();
  const wanted = [...new Set(domains.map((d) => d.trim().toLowerCase()).filter(isQueryableDomain))].slice(0, MAX_DOMAINS);
  if (wanted.length === 0) return { entries: [], failure: null, message: null };
  if (!key) {
    return { entries: [], failure: "no-key", message: "外部からのリンクの評価は取得していません（OPENPAGERANK_API_KEY が未設定）" };
  }

  const cached: OprEntry[] = [];
  const missing: string[] = [];
  for (const d of wanted) {
    const hit = cache.get(d);
    if (hit) cached.push(hit);
    else missing.push(d);
  }
  if (missing.length === 0) return { entries: cached, failure: null, message: null };

  const query = missing.map((d) => `domains[]=${encodeURIComponent(d)}`).join("&");
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(`${OPR_ENDPOINT}?${query}`, {
      headers: { "API-OPR": key, accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      return { entries: cached, failure: "upstream", message: `Open PageRank がエラーを返しました（HTTP ${res.status}）` };
    }
    const entries = parseOpr(await res.json());
    for (const e of entries) cache.set(e.domain, e);
    return { entries: [...cached, ...entries], failure: null, message: null };
  } catch {
    return { entries: cached, failure: "network", message: "Open PageRank に接続できませんでした" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
