/**
 * PageSpeed Insights API v5 の呼び出し（サーバー専用）。
 *
 * PAGESPEED_API_KEY が無くても動くが、Google 側の回数制限が厳しく 429 が返る。
 * その場合はエラーを投げず、日本語の理由を返してレポートの他の部分を続ける。
 * 結果は 24 時間キャッシュする（同じ URL を何度も測っても値はほぼ変わらない）。
 */
import { fetchText } from "@/lib/analyzer/fetch";
import { globalCache } from "@/lib/cache";
import { PSI_CACHE_MS } from "@/lib/page-report/config";
import { parsePsi } from "./parse";
import type { PsiResult, PsiStrategy } from "./types";

const ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
/** Lighthouse の結果 JSON は数 MB になることがある */
const MAX_BYTES = 12 * 1024 * 1024;
/** 実際に対象ページを計測するので時間がかかる */
const TIMEOUT_MS = 60_000;

const cache = globalCache<PsiResult>("psi", PSI_CACHE_MS, 100);

export function isPagespeedKeyConfigured(): boolean {
  return Boolean(process.env.PAGESPEED_API_KEY?.trim());
}

/** 計測に使う URL を組み立てる（キーは環境変数からのみ。呼び出し側に渡さない） */
export function buildPsiUrl(url: string, strategy: PsiStrategy, apiKey?: string): string {
  const target = new URL(ENDPOINT);
  target.searchParams.set("url", url);
  target.searchParams.set("strategy", strategy);
  for (const category of ["PERFORMANCE", "ACCESSIBILITY", "SEO"]) {
    target.searchParams.append("category", category);
  }
  target.searchParams.set("locale", "ja");
  if (apiKey) target.searchParams.set("key", apiKey);
  return target.toString();
}

export interface PsiOutcome {
  result: PsiResult | null;
  /** 取得できなかった理由（日本語）。result があれば null */
  error: string | null;
  cached: boolean;
}

/** HTTP ステータス → 日本語の理由 */
export function psiErrorMessage(status: number, usedApiKey: boolean): string {
  if (status === 429) {
    return usedApiKey
      ? "PageSpeed Insights の呼び出し上限に達しました。しばらく待ってから再取得してください"
      : "PageSpeed Insights の呼び出し上限に達しました（API キー未設定のため制限が厳しくなっています）。PAGESPEED_API_KEY を設定すると安定して取得できます";
  }
  if (status === 400) {
    return "PageSpeed Insights がこの URL を計測できませんでした（公開されていない、または応答が返らない可能性があります）";
  }
  if (status === 403) {
    return "PageSpeed Insights の API キーが拒否されました。PAGESPEED_API_KEY の値と利用制限を確認してください";
  }
  if (status === 500 || status === 503) {
    return "PageSpeed Insights が一時的に応答できませんでした。時間をおいて再取得してください";
  }
  return `PageSpeed Insights の取得に失敗しました（HTTP ${status}）`;
}

/**
 * 表示速度と Core Web Vitals を取得する。
 * 失敗しても例外にせず error を返す（レポート全体を落とさないため）。
 */
export async function fetchPsi(
  url: string,
  strategy: PsiStrategy = "mobile",
  options: { refresh?: boolean } = {},
): Promise<PsiOutcome> {
  const key = `${strategy}|${url}`;
  if (!options.refresh) {
    const hit = cache.get(key);
    if (hit) return { result: hit, error: null, cached: true };
  }

  const apiKey = process.env.PAGESPEED_API_KEY?.trim() || undefined;
  const requestUrl = buildPsiUrl(url, strategy, apiKey);

  let response;
  try {
    response = await fetchText(requestUrl, { timeoutMs: TIMEOUT_MS, maxBytes: MAX_BYTES });
  } catch {
    return { result: null, error: "PageSpeed Insights に接続できませんでした", cached: false };
  }

  if (!response.ok) {
    return { result: null, error: psiErrorMessage(response.status, Boolean(apiKey)), cached: false };
  }

  let json: unknown;
  try {
    json = JSON.parse(response.body);
  } catch {
    return { result: null, error: "PageSpeed Insights の応答を解釈できませんでした", cached: false };
  }

  const result = parsePsi(json, { requestedUrl: url, strategy, usedApiKey: Boolean(apiKey) });
  cache.set(key, result);
  return { result, error: null, cached: false };
}
