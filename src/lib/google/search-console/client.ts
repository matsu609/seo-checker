/**
 * Search Console API v3 のクライアント。
 *
 * エンドポイントは固定（ユーザー入力の URL ではないので assertPublicHost の対象外）。
 * アクセストークンはログイン中のユーザーのものを Clerk から取る（token.ts）。
 */
import { GoogleLinkError, mapGoogleHttpError } from "../errors";
import { getGoogleTokenFor } from "../token";
import { parseSearchAnalytics, parseSites } from "./parse";
import type {
  SearchAnalyticsQuery,
  SearchAnalyticsRow,
  SearchConsoleClient,
  SearchConsoleSite,
} from "./types";

export const SEARCH_CONSOLE_ENDPOINT = "https://searchconsole.googleapis.com/webmasters/v3";
const TIMEOUT_MS = 30_000;
/** 1 回の query で取る最大行数（Google の上限は 25,000） */
export const MAX_ROW_LIMIT = 25_000;
const DEFAULT_ROW_LIMIT = 1_000;

export interface SearchConsoleClientOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** テスト用。省略時は Clerk からユーザーのトークンを取る */
  getToken?: () => Promise<string>;
}

const LABEL = "Search Console";

async function callApi(
  path: string,
  init: RequestInit,
  options: SearchConsoleClientOptions,
): Promise<unknown> {
  const endpoint = options.endpoint ?? SEARCH_CONSOLE_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const getToken = options.getToken ?? (() => getGoogleTokenFor("search-console"));
  const token = await getToken();

  let res: Response;
  try {
    res = await fetchImpl(`${endpoint}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        accept: "application/json",
      },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new GoogleLinkError(
      timedOut ? `${LABEL} の応答がありませんでした（タイムアウト）` : `${LABEL} に接続できませんでした`,
      "network",
    );
  }
  if (!res.ok) throw mapGoogleHttpError(res.status, LABEL);
  try {
    return await res.json();
  } catch {
    throw new GoogleLinkError(`${LABEL} の応答を解釈できませんでした`, "network");
  }
}

export function createSearchConsoleClient(
  options: SearchConsoleClientOptions = {},
): SearchConsoleClient {
  return {
    async listSites(): Promise<SearchConsoleSite[]> {
      return parseSites(await callApi("/sites", { method: "GET" }, options));
    },

    async query(siteUrl: string, q: SearchAnalyticsQuery): Promise<SearchAnalyticsRow[]> {
      if (!siteUrl) {
        throw new GoogleLinkError("サイトが選ばれていません。", "not_selected");
      }
      // siteUrl は "https://example.com/" や "sc-domain:example.com" で、
      // スラッシュやコロンを含む。パスに入れるので必ずエンコードする
      const path = `/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
      const body = {
        startDate: q.startDate,
        endDate: q.endDate,
        ...(q.dimensions?.length ? { dimensions: q.dimensions } : {}),
        rowLimit: Math.min(Math.max(1, q.rowLimit ?? DEFAULT_ROW_LIMIT), MAX_ROW_LIMIT),
        ...(q.startRow ? { startRow: q.startRow } : {}),
      };
      const payload = await callApi(
        path,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
        options,
      );
      return parseSearchAnalytics(payload);
    },
  };
}
