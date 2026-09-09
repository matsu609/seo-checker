/**
 * 「選べるものが 1 つも無い」理由の判定。純粋関数だけを置く（クライアントからも読める）。
 *
 * 一覧が空に見える理由は 3 つあり、出すべき案内がそれぞれ違う。
 *   1. 読み取りの権限が足りない        → 接続し直してもらう
 *   2. 一覧の取得に失敗した            → エラーを出す
 *   3. Google 側にまだ何も無い          → 登録・設置の手順を案内する（GoogleSetupGuide）
 *
 * 3 だけを needsGoogleSetup で拾う。1 や 2 のときに「まだ登録がありません」と出すと、
 * 原因の違う相手に的外れな作業をさせてしまうため。
 */
import { isUnverifiedSite } from "./search-console/parse";
import type { SearchConsoleSite } from "./search-console/types";
import { canUse, type GoogleService } from "./scopes";
import type { GoogleStatus } from "./status";

/** 実際に選べるサイト。所有権が未確認のものは選んでも 403 になるので外す */
export function usableSites(sites: readonly SearchConsoleSite[]): SearchConsoleSite[] {
  return sites.filter((s) => !isUnverifiedSite(s));
}

/** 一覧が空の理由が「Google 側の設定がまだ」なら true */
export function needsGoogleSetup(status: GoogleStatus, service: GoogleService): boolean {
  if (!status.connected) return false;
  if (!canUse(status.scopes, service)) return false;
  if (service === "search-console") {
    if (status.errors.searchConsole) return false;
    return usableSites(status.sites).length === 0;
  }
  if (status.errors.analytics) return false;
  return status.properties.length === 0;
}
