/**
 * Ahrefs の Domain Rating（DR、0〜100）を無料の公開エンドポイントから取る。サーバー専用。
 *
 * 日本語の「ドメインパワー測定サイト」（ラッコキーワードのドメインパワーチェック、
 * Ahrefs の Website Authority Checker など）が出している数値がこの DR で、
 * **無料のツールと同じ数字**をそのまま表示できる。
 *
 * - エンドポイント: GET /v3/public/domain-rating-free
 * - 無料の Ahrefs アカウントで作った APIv3 キーが要る（API ユニットは消費しない）
 * - レート制限は Ahrefs API の既定で 1 分 60 回（超えると 429）。1 回の分析では自社 + 競合 2 件 = 最大 3 回
 * - **表示には「Domain Rating by Ahrefs」の帰属表示が要る**（応答の license に規約 URL）
 *
 * キーが無ければ何もせず null を返す（ダミーは返さない）。
 */
import { globalCache } from "@/lib/cache";
import { isQueryableDomain } from "./domain";

export const AHREFS_DR_ENDPOINT = "https://api.ahrefs.com/v3/public/domain-rating-free";
/** 画面に必ず出す帰属表示（Ahrefs の利用条件） */
export const AHREFS_ATTRIBUTION = "Domain Rating by Ahrefs";
export const AHREFS_URL = "https://ahrefs.com/";
const TIMEOUT_MS = 10_000;
/** DR の更新は毎日ではないので長めに持つ */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface AhrefsDr {
  domain: string;
  /** 0〜100。取得できなければ null */
  rating: number | null;
  /** 応答に付いてくる利用条件の URL */
  license: string | null;
}

export type AhrefsFailure = "no-key" | "invalid" | "rate-limit" | "upstream" | "network";

export interface AhrefsOutcome {
  result: AhrefsDr | null;
  failure: AhrefsFailure | null;
  message: string | null;
}

const cache = globalCache<AhrefsOutcome>("ahrefs-dr", CACHE_TTL_MS, 300);

export function ahrefsApiKey(): string | null {
  return process.env.AHREFS_API_KEY?.trim() || null;
}

export function isAhrefsEnabled(): boolean {
  return ahrefsApiKey() !== null;
}

/**
 * 応答を読む。`{ domain_rating: { domain_rating: 46.0, license: "..." } }` の形だが、
 * 平たい `{ domain_rating: 46 }` でも読めるようにしてある（仕様変更で落ちないように）。
 */
export function parseAhrefsDr(domain: string, payload: unknown): AhrefsDr | null {
  if (typeof payload !== "object" || payload === null) return null;
  const outer = (payload as { domain_rating?: unknown }).domain_rating;
  if (typeof outer === "number") return Number.isFinite(outer) ? { domain, rating: outer, license: null } : null;
  if (typeof outer !== "object" || outer === null) return null;
  const inner = outer as { domain_rating?: unknown; license?: unknown };
  const value = typeof inner.domain_rating === "number" ? inner.domain_rating : Number(inner.domain_rating);
  return {
    domain,
    rating: Number.isFinite(value) ? value : null,
    license: typeof inner.license === "string" ? inner.license : null,
  };
}

export interface AhrefsOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export async function fetchAhrefsDr(domain: string, options: AhrefsOptions = {}): Promise<AhrefsOutcome> {
  const key = ahrefsApiKey();
  if (!key) {
    return { result: null, failure: "no-key", message: "Ahrefs の DR は取得していません（AHREFS_API_KEY が未設定）" };
  }
  if (!isQueryableDomain(domain)) {
    return { result: null, failure: "invalid", message: "ドメイン名を判定できませんでした" };
  }
  const hit = cache.get(domain);
  if (hit) return hit;

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  let outcome: AhrefsOutcome;
  try {
    const res = await fetchImpl(`${AHREFS_DR_ENDPOINT}?target=${encodeURIComponent(domain)}&output=json`, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 429) {
      outcome = { result: null, failure: "rate-limit", message: "Ahrefs の無料エンドポイントの回数制限に達しました（しばらく待つと戻ります）" };
    } else if (!res.ok) {
      outcome = {
        result: null,
        failure: "upstream",
        message: res.status === 401 || res.status === 403 ? "Ahrefs の API キーが拒否されました（AHREFS_API_KEY を確認してください）" : `Ahrefs がエラーを返しました（HTTP ${res.status}）`,
      };
    } else {
      const parsed = parseAhrefsDr(domain, await res.json());
      outcome = parsed ? { result: parsed, failure: null, message: null } : { result: null, failure: "upstream", message: "Ahrefs の応答を解釈できませんでした" };
    }
  } catch {
    outcome = { result: null, failure: "network", message: "Ahrefs に接続できませんでした" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
  if (outcome.failure !== "network" && outcome.failure !== "rate-limit") cache.set(domain, outcome);
  return outcome;
}
