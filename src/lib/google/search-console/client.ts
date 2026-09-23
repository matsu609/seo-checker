/**
 * Search Console API v3 のクライアント。
 *
 * エンドポイントは固定（ユーザー入力の URL ではないので assertPublicHost の対象外）。
 * アクセストークンはログイン中のユーザーのものを Clerk から取る（token.ts）。
 */
import { callGoogleApi, withResolvedToken, type GoogleApiSpec, type GoogleCallOptions } from "../call";
import { GoogleLinkError } from "../errors";
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

export interface SearchConsoleClientOptions extends GoogleCallOptions {
  endpoint?: string;
}

const API: GoogleApiSpec = { label: "Search Console", spaced: true, service: "search-console", timeoutMs: TIMEOUT_MS };

/**
 * クライアントは 1 回の処理（1 リクエスト）ごとに作る。トークンは最初の呼び出しで 1 回だけ取り、
 * 同じクライアントの呼び出し（検索パフォーマンスは 5 本並行）で使い回す（2026-09-23）。
 */
export function createSearchConsoleClient(
  clientOptions: SearchConsoleClientOptions = {},
): SearchConsoleClient {
  const options = withResolvedToken(clientOptions, "search-console");
  const callApi = (path: string, init: RequestInit) => callGoogleApi(`${options.endpoint ?? SEARCH_CONSOLE_ENDPOINT}${path}`, init, API, options);
  return {
    async listSites(): Promise<SearchConsoleSite[]> {
      return parseSites(await callApi("/sites", { method: "GET" }));
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
      const payload = await callApi(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return parseSearchAnalytics(payload);
    },
  };
}
