/**
 * 「Google サーチコンソール連携」画面の状態（接続・権限・選べるサイト・選択中のサイト）。サーバー専用。
 * 判定の純関数と型は setup.ts（クライアントからも読むため、サーバー専用の import を持たせない）。
 */
import { GoogleLinkError } from "../errors";
import { canUse } from "../scopes";
import { getGoogleConnection } from "../token";
import { createSearchConsoleClient } from "./client";
import { getSearchConsoleSettings } from "./settings";
import { apiScopes, type SearchConsoleStatus } from "./setup";

export type { SearchConsoleStatus };

export async function loadSearchConsoleStatus(): Promise<SearchConsoleStatus> {
  const [connection, settings] = await Promise.all([getGoogleConnection(), getSearchConsoleSettings()]);
  const status: SearchConsoleStatus = {
    connected: connection.connected,
    hasScope: connection.connected && canUse(connection.scopes, "search-console"),
    email: connection.email,
    grantedScopes: apiScopes(connection.scopes),
    sites: [],
    siteUrl: settings.searchConsoleSiteUrl ?? null,
  };
  if (!status.hasScope) return status;
  try {
    status.sites = await createSearchConsoleClient().listSites();
  } catch (err) {
    status.error = err instanceof GoogleLinkError ? err.message : "Search Console のサイト一覧を取得できませんでした。";
  }
  return status;
}
