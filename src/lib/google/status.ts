/**
 * Google 連携の状態と、選べるサイト / プロパティの一覧。サーバー専用。
 *
 * Search Console と GA4 は片方だけ失敗することがある（権限の付け忘れなど）ので、
 * それぞれ独立に扱い、失敗した側だけ errors に理由を入れる。片方が落ちても
 * もう片方は選べるようにするため。
 */
import { listGa4Properties, type Ga4Property } from "./analytics-admin";
import { GoogleLinkError } from "./errors";
import { canUse } from "./scopes";
import { createSearchConsoleClient } from "./search-console/client";
import type { SearchConsoleSite } from "./search-console/types";
import { getLinkSettings, type LinkSettings } from "./settings";
import { getGoogleConnection } from "./token";

export interface GoogleStatus {
  connected: boolean;
  email?: string;
  scopes: string[];
  missingScopes: string[];
  settings: LinkSettings;
  sites: SearchConsoleSite[];
  properties: Ga4Property[];
  errors: { searchConsole?: string; analytics?: string };
}

const messageOf = (err: unknown) =>
  err instanceof GoogleLinkError ? err.message : "一覧を取得できませんでした。";

export async function loadGoogleStatus(): Promise<GoogleStatus> {
  const connection = await getGoogleConnection();
  const settings = await getLinkSettings();
  const status: GoogleStatus = {
    connected: connection.connected,
    email: connection.email,
    scopes: connection.scopes,
    missingScopes: connection.missingScopes,
    settings,
    sites: [],
    properties: [],
    errors: {},
  };
  if (!connection.connected) return status;

  // 許可されているスコープの分だけ一覧を取りに行く
  const [sites, properties] = await Promise.allSettled([
    canUse(connection.scopes, "search-console")
      ? createSearchConsoleClient().listSites()
      : Promise.resolve([]),
    canUse(connection.scopes, "analytics") ? listGa4Properties() : Promise.resolve([]),
  ]);

  if (sites.status === "fulfilled") status.sites = sites.value;
  else status.errors.searchConsole = messageOf(sites.reason);

  if (properties.status === "fulfilled") status.properties = properties.value;
  else status.errors.analytics = messageOf(properties.reason);

  return status;
}
