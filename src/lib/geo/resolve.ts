/**
 * Gemini の引用 URL の解決（仕様書 §1.3）。サーバー専用。
 *
 * Gemini は引用を `vertexaisearch.cloud.google.com/grounding-api-redirect/...`
 * のようなリダイレクト形式で返すことがある。そのままでは
 * 「どのドメインが引用されたか」が分からないので、最終 URL まで解決する。
 *
 * - 取得は既存の安全な経路（assertPublicHost → fetchText）だけを通す
 * - 解決できたものはプロセス内キャッシュに置く（同じ URL を何度も叩かない）
 * - **失敗しても引用判定からは外さない**。`unresolved: true` の「不明ドメイン」として残す
 */
import { assertPublicHost, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import { globalCache } from "@/lib/cache";
import { normalizeDomain } from "./normalize";
import type { GeoCitation } from "./types";

/** 解決が要るリダイレクトのホスト */
const REDIRECT_HOSTS = ["vertexaisearch.cloud.google.com", "www.google.com", "google.com"];
/** 本文は要らないので少しだけ読む */
const MAX_BYTES = 4096;
const TIMEOUT_MS = 8000;
/** 解決結果は変わらないので長めに持つ */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = globalCache<string | null>("geo-resolve-url", CACHE_TTL_MS, 1000);

/** この URL は解決が必要か（リダイレクト経由か） */
export function needsResolution(url: string): boolean {
  const domain = normalizeDomain(url);
  if (!domain) return false;
  return REDIRECT_HOSTS.some((host) => domain === normalizeDomain(host));
}

export interface ResolveOptions {
  /** テスト用。与えると実際の取得の代わりに使う */
  resolveImpl?: (url: string) => Promise<string | null>;
  signal?: AbortSignal;
}

/** 1 件の URL を最終 URL まで解決する。できなければ null */
export async function resolveUrl(url: string, options: ResolveOptions = {}): Promise<string | null> {
  const hit = cache.get(url);
  if (hit !== undefined) return hit;

  let resolved: string | null = null;
  try {
    if (options.resolveImpl) {
      resolved = await options.resolveImpl(url);
    } else {
      const target = normalizeUrl(url);
      await assertPublicHost(target);
      const res = await fetchText(target.toString(), { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });
      resolved = res.finalUrl && !needsResolution(res.finalUrl) ? res.finalUrl : null;
    }
  } catch {
    resolved = null;
  }
  cache.set(url, resolved);
  return resolved;
}

/**
 * 引用の一覧を解決する。リダイレクトでないものはそのまま通す。
 * 解決に失敗したものは `unresolved: true` にして残す（除外しない）。
 */
export async function resolveCitations(citations: readonly GeoCitation[], options: ResolveOptions = {}): Promise<GeoCitation[]> {
  const out: GeoCitation[] = [];
  for (const citation of citations) {
    if (!needsResolution(citation.url)) {
      out.push({ ...citation, domain: normalizeDomain(citation.url), unresolved: false });
      continue;
    }
    const resolved = await resolveUrl(citation.url, options);
    out.push(
      resolved
        ? { ...citation, url: resolved, domain: normalizeDomain(resolved), unresolved: false }
        : { ...citation, unresolved: true, domain: "" },
    );
  }
  return out;
}
