/**
 * 任意の層: Google 連携（Search Console / GA4）。サーバー専用。
 *
 * 利用者が設定画面で連携していれば、直近 28 日の検索パフォーマンスと自然検索の
 * 流入を事実シートに足す。連携が無い・失敗した場合は notes に書いて空を返す
 * （報告書は連携なしでも完成する。docs/dev/seo-analysis-spec.md §0）。
 */
import { headerIndex, metricNumber, dimensionValue, rangeForDays, previousRange, type Ga4Client } from "@/lib/ga4";
import { resolveGa4Client } from "@/lib/google/ga4";
import { createSearchConsoleClient } from "@/lib/google/search-console/client";
import { totalsOf } from "@/lib/google/search-console/parse";
import { searchConsoleRange } from "@/lib/google/search-console/period";
import type { SearchConsoleClient } from "@/lib/google/search-console/types";
import { getLinkSettings } from "@/lib/google/settings";
import type { SheetGoogle } from "./sheet/types";

const DAYS = 28;
const TOP_ROWS = 10;

/** 連携先のサイトが分析対象のオリジンと同じか（sc-domain: はサブドメインも含む） */
export function siteMatchesOrigin(siteUrl: string, origin: string): boolean {
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    const site = new URL(siteUrl);
    return site.hostname.toLowerCase() === host;
  } catch {
    return false;
  }
}

export interface CollectGoogleDeps {
  getSettings?: () => Promise<{ searchConsoleSiteUrl?: string; ga4PropertyId?: string }>;
  searchConsole?: () => SearchConsoleClient;
  ga4?: () => Promise<{ client: Ga4Client } | null>;
  now?: Date;
}

export async function collectGoogle(origin: string, deps: CollectGoogleDeps = {}): Promise<{ google: SheetGoogle; searchConsole: boolean; ga4: boolean }> {
  const notes: string[] = [];
  let settings: { searchConsoleSiteUrl?: string; ga4PropertyId?: string } = {};
  try {
    settings = await (deps.getSettings ?? getLinkSettings)();
  } catch {
    settings = {};
  }

  let searchConsole: SheetGoogle["searchConsole"] = null;
  if (!settings.searchConsoleSiteUrl) {
    notes.push("Search Console は連携していません（設定画面で Google アカウントを接続すると、検索クエリと表示回数が加わります）");
  } else if (!siteMatchesOrigin(settings.searchConsoleSiteUrl, origin)) {
    notes.push(`Search Console の連携先（${settings.searchConsoleSiteUrl}）が分析対象と異なるため使っていません`);
  } else {
    try {
      const client = (deps.searchConsole ?? createSearchConsoleClient)();
      const siteUrl = settings.searchConsoleSiteUrl;
      const range = searchConsoleRange(DAYS, deps.now);
      const previous = previousRange(range);
      const [totalRows, previousRows, queries, pages] = await Promise.all([
        client.query(siteUrl, { ...range, rowLimit: 1 }),
        client.query(siteUrl, { ...previous, rowLimit: 1 }),
        client.query(siteUrl, { ...range, dimensions: ["query"], rowLimit: TOP_ROWS }),
        client.query(siteUrl, { ...range, dimensions: ["page"], rowLimit: TOP_ROWS }),
      ]);
      searchConsole = {
        siteUrl,
        range,
        totals: totalsOf(totalRows),
        previousTotals: totalsOf(previousRows),
        queries: queries.map((r) => ({ query: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
        pages: pages.map((r) => ({ page: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
      };
    } catch (err) {
      notes.push(`Search Console のデータを取得できませんでした（${err instanceof Error ? err.message : "エラー"}）`);
    }
  }

  let ga4: SheetGoogle["ga4"] = null;
  try {
    const resolved = await (deps.ga4 ?? resolveGa4Client)();
    if (!resolved) {
      notes.push("GA4 は連携していません（連携すると自然検索の流入とキーイベントが加わります）");
    } else {
      const range = rangeForDays(DAYS, deps.now);
      const [channels, landing] = await Promise.all([
        resolved.client.runReport({
          dateRanges: [range],
          dimensions: [{ name: "sessionDefaultChannelGroup" }],
          metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "engagementRate" }, { name: "keyEvents" }],
          limit: 50,
        }),
        resolved.client.runReport({
          dateRanges: [range],
          dimensions: [{ name: "landingPage" }],
          metrics: [{ name: "sessions" }, { name: "keyEvents" }],
          dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } },
          orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
          limit: TOP_ROWS,
        }),
      ]);
      const sAt = headerIndex(channels.metricHeaders, "sessions");
      const uAt = headerIndex(channels.metricHeaders, "totalUsers");
      const eAt = headerIndex(channels.metricHeaders, "engagementRate");
      const kAt = headerIndex(channels.metricHeaders, "keyEvents");
      const organic = { sessions: 0, users: 0, engagementRate: 0, keyEvents: 0 };
      const all = { sessions: 0, keyEvents: 0 };
      for (const row of channels.rows) {
        const sessions = metricNumber(row, sAt);
        const keyEvents = metricNumber(row, kAt);
        all.sessions += sessions;
        all.keyEvents += keyEvents;
        if (dimensionValue(row, 0) === "Organic Search") {
          organic.sessions += sessions;
          organic.users += metricNumber(row, uAt);
          organic.engagementRate = metricNumber(row, eAt);
          organic.keyEvents += keyEvents;
        }
      }
      const lsAt = headerIndex(landing.metricHeaders, "sessions");
      const lkAt = headerIndex(landing.metricHeaders, "keyEvents");
      ga4 = {
        propertyId: resolved.client.propertyId,
        range,
        organic,
        all,
        landing: landing.rows.map((row) => ({ page: dimensionValue(row, 0), sessions: metricNumber(row, lsAt), keyEvents: metricNumber(row, lkAt) })),
      };
      notes.push("GA4 のプロパティは設定画面で選んだものです（分析対象のサイトと一致しているかは確かめられません）");
    }
  } catch (err) {
    notes.push(`GA4 のデータを取得できませんでした（${err instanceof Error ? err.message : "エラー"}）`);
  }

  return { google: { searchConsole, ga4, notes }, searchConsole: searchConsole !== null, ga4: ga4 !== null };
}
