/**
 * SerpApi（https://serpapi.com/）で Google 検索結果を取る。
 * API の URL は固定（ユーザー入力の URL ではないので assertPublicHost の対象外）。
 * キーはサーバーの環境変数 SERPAPI_KEY からだけ読む。
 */
import { aiOverviewPageToken, parseSerpApiResponse } from "./parse";
import type { SerpProvider, SerpQuery, SerpResult } from "./types";

export const SERPAPI_ENDPOINT = "https://serpapi.com/search.json";
const DEFAULT_TIMEOUT_MS = 30_000;

export class SerpError extends Error {
  constructor(
    message: string,
    public readonly code: "auth" | "rate_limit" | "timeout" | "network" | "bad_response" | "bad_request",
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SerpError";
  }
}

export interface SerpApiOptions {
  /** テスト用の差し替え */
  fetchImpl?: typeof fetch;
  endpoint?: string;
  timeoutMs?: number;
}

/** リクエストパラメータを組み立てる（テストで検証できるよう分離） */
export function buildSerpApiParams(query: SerpQuery, apiKey: string): URLSearchParams {
  const params = new URLSearchParams({
    engine: "google",
    q: query.q,
    gl: query.gl ?? "jp",
    hl: query.hl ?? "ja",
    num: String(Math.min(100, Math.max(10, query.num ?? 100))),
    device: query.device ?? "desktop",
    api_key: apiKey,
  });
  if (query.location) params.set("location", query.location);
  return params;
}

function toSerpError(err: unknown): SerpError {
  if (err instanceof SerpError) return err;
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
    return new SerpError("検索結果の取得がタイムアウトしました", "timeout");
  }
  return new SerpError("検索結果の取得に失敗しました（ネットワークエラー）", "network");
}

async function requestJson(url: string, opts: Required<Pick<SerpApiOptions, "fetchImpl" | "timeoutMs">>): Promise<unknown> {
  let res: Response;
  try {
    res = await opts.fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(opts.timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    throw toSerpError(err);
  }
  if (res.status === 401 || res.status === 403) {
    throw new SerpError("SERPAPI_KEY が無効です", "auth", res.status);
  }
  if (res.status === 429) {
    throw new SerpError("SerpApi の利用上限に達しました。しばらく待って再試行してください", "rate_limit", 429);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SerpError("SerpApi の応答を解釈できませんでした", "bad_response", res.status);
  }
  const error = json && typeof json === "object" ? (json as { error?: unknown }).error : undefined;
  if (!res.ok) {
    throw new SerpError(
      typeof error === "string" ? `SerpApi エラー: ${error}` : `SerpApi エラー（HTTP ${res.status}）`,
      res.status >= 400 && res.status < 500 ? "bad_request" : "bad_response",
      res.status,
    );
  }
  if (typeof error === "string" && !/hasn't returned any results/i.test(error)) {
    throw new SerpError(`SerpApi エラー: ${error}`, "bad_request", res.status);
  }
  return json;
}

export function createSerpApiProvider(apiKey: string, options: SerpApiOptions = {}): SerpProvider {
  const endpoint = options.endpoint ?? SERPAPI_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    name: "serpapi",
    async search(query: SerpQuery): Promise<SerpResult> {
      const q = query.q.trim();
      if (!q) throw new SerpError("キーワードを入力してください", "bad_request");
      const device = query.device ?? "desktop";
      const params = buildSerpApiParams({ ...query, q, device }, apiKey);
      const raw = await requestJson(`${endpoint}?${params.toString()}`, { fetchImpl, timeoutMs });

      // AI Overviews の本文が別リクエストになっている場合は取り直す（失敗しても本体は返す）。
      // page_token があった時点で「AIO は表示されていた」ことは確定しているので、
      // 取得に失敗したときは未取得（aiOverviewUnavailable）として伝える。
      // ここを黙って null にすると「AIO 表示なし」の観測として保存され、出現率が実態より低く出る。
      let aiOverviewRaw: unknown;
      let aiOverviewUnavailable = false;
      const token = aiOverviewPageToken(raw);
      if (token) {
        const aoParams = new URLSearchParams({ engine: "google_ai_overview", page_token: token, api_key: apiKey });
        try {
          const aoJson = await requestJson(`${endpoint}?${aoParams.toString()}`, { fetchImpl, timeoutMs });
          const ao = aoJson && typeof aoJson === "object" ? (aoJson as { ai_overview?: unknown }).ai_overview : undefined;
          if (ao) aiOverviewRaw = ao;
          else aiOverviewUnavailable = true;
        } catch (err) {
          aiOverviewUnavailable = true;
          console.warn("[serp] ai_overview の取得に失敗", err instanceof Error ? err.message : err);
        }
      }

      return parseSerpApiResponse(raw, {
        query: q,
        device,
        provider: "serpapi",
        aiOverviewRaw,
        aiOverviewUnavailable,
      });
    },
  };
}
