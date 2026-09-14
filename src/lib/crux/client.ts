/**
 * CrUX API / CrUX History API のクライアント（サーバー専用）。
 *
 * キーは CRUX_API_KEY があればそれ、無ければ PAGESPEED_API_KEY（同じ Google Cloud
 * プロジェクトで「Chrome UX Report API」を有効にしておく）。
 * URL 単位のデータが無い（404）ときは呼び出し側が Origin 単位に落とす。
 * 失敗は例外にせず failure を返す（報告書全体を落とさない）。
 */
import { globalCache } from "@/lib/cache";
import { parseCruxHistory, parseCruxRecord } from "./parse";
import type { CruxHistory, CruxOutcome, CruxRecord } from "./types";

export const CRUX_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryRecord";
export const CRUX_HISTORY_ENDPOINT = "https://chromeuxreport.googleapis.com/v1/records:queryHistoryRecord";
const TIMEOUT_MS = 15_000;
/** CrUX は日次更新なので、同じキーは長めに持つ */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const recordCache = globalCache<CruxOutcome<CruxRecord>>("crux-record", CACHE_TTL_MS, 200);
const historyCache = globalCache<CruxOutcome<CruxHistory>>("crux-history", CACHE_TTL_MS, 50);

export function cruxApiKey(): string | null {
  const key = process.env.CRUX_API_KEY?.trim() || process.env.PAGESPEED_API_KEY?.trim();
  return key || null;
}

export function isCruxEnabled(): boolean {
  return cruxApiKey() !== null;
}

export type CruxTarget = { url: string } | { origin: string };

export type CruxFormFactor = "PHONE" | "DESKTOP" | "TABLET";

interface CallOptions {
  formFactor?: CruxFormFactor;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

async function call<T>(
  endpoint: string,
  target: CruxTarget,
  parse: (payload: unknown) => T | null,
  options: CallOptions,
): Promise<CruxOutcome<T>> {
  const key = cruxApiKey();
  if (!key) return { result: null, failure: "no-key", message: "CrUX API のキー（CRUX_API_KEY か PAGESPEED_API_KEY）が未設定です" };
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(`${endpoint}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...target, ...(options.formFactor ? { formFactor: options.formFactor } : {}) }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status === 404) {
      return { result: null, failure: "no-data", message: "Chrome の実ユーザーデータが足りないため、この単位のデータはありません" };
    }
    if (!res.ok) {
      return { result: null, failure: "upstream", message: `CrUX API がエラーを返しました（HTTP ${res.status}）` };
    }
    const payload: unknown = await res.json();
    const parsed = parse(payload);
    if (!parsed) return { result: null, failure: "upstream", message: "CrUX API の応答を解釈できませんでした" };
    return { result: parsed, failure: null, message: null };
  } catch {
    return { result: null, failure: "network", message: "CrUX API に接続できませんでした" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

function keyOf(prefix: string, target: CruxTarget, formFactor?: CruxFormFactor): string {
  return `${prefix}|${"url" in target ? `url:${target.url}` : `origin:${target.origin}`}|${formFactor ?? "ALL"}`;
}

/** 直近 28 日の実測値 */
export async function fetchCruxRecord(target: CruxTarget, options: CallOptions = {}): Promise<CruxOutcome<CruxRecord>> {
  const key = keyOf("r", target, options.formFactor);
  const hit = recordCache.get(key);
  if (hit) return hit;
  const outcome = await call(CRUX_ENDPOINT, target, parseCruxRecord, options);
  if (outcome.failure !== "network") recordCache.set(key, outcome);
  return outcome;
}

/** 過去 40 期（週ごとの 28 日集計）の推移 */
export async function fetchCruxHistory(target: CruxTarget, options: CallOptions = {}): Promise<CruxOutcome<CruxHistory>> {
  const key = keyOf("h", target, options.formFactor);
  const hit = historyCache.get(key);
  if (hit) return hit;
  const outcome = await call(CRUX_HISTORY_ENDPOINT, target, parseCruxHistory, options);
  if (outcome.failure !== "network") historyCache.set(key, outcome);
  return outcome;
}

/**
 * URL 単位 → 無ければ Origin 単位 → それも無ければ null。
 * どの単位の値かは result.scope で分かる（画面に必ず出す）。
 */
export async function fetchCruxWithFallback(url: string, options: CallOptions = {}): Promise<CruxOutcome<CruxRecord>> {
  const byUrl = await fetchCruxRecord({ url }, options);
  if (byUrl.result || byUrl.failure !== "no-data") return byUrl;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return byUrl;
  }
  return fetchCruxRecord({ origin }, options);
}
