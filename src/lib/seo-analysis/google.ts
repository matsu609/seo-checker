/**
 * 任意の層: Google 連携（Search Console / GA4）。サーバー専用。
 *
 * 利用者が設定画面で連携していれば、直近 28 日の検索パフォーマンスと自然検索の
 * 流入を事実シートに足す。連携が無い・失敗した場合は notes に書いて空を返す
 * （報告書は連携なしでも完成する。docs/dev/seo-analysis-spec.md §0）。
 */
import type { EventMapping } from "@/lib/diagnosis/events";
import { collectGa4Dataset } from "@/lib/diagnosis/sources/ga4";
import { collectGscDataset, DIAGNOSIS_DAYS } from "@/lib/diagnosis/sources/gsc";
import { ORGANIC_CHANNEL } from "@/lib/diagnosis/engine";
import type { Ga4Dataset, GscDataset } from "@/lib/diagnosis/types";
import { shareOf } from "@/lib/diagnosis/metrics";
import type { Ga4Client } from "@/lib/ga4";
import { resolveGa4Client } from "@/lib/google/ga4";
import { createSearchConsoleClient } from "@/lib/google/search-console/client";
import type { SearchConsoleClient } from "@/lib/google/search-console/types";
import { getLinkSettings } from "@/lib/google/settings";
import type { SheetGoogle } from "./sheet/types";

const DAYS = DIAGNOSIS_DAYS;
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
  getSettings?: () => Promise<{ searchConsoleSiteUrl?: string; ga4PropertyId?: string; eventMapping?: Partial<EventMapping> }>;
  searchConsole?: () => SearchConsoleClient;
  ga4?: () => Promise<{ client: Ga4Client } | null>;
  /** 設定画面で人が直したイベントの対応表 */
  eventMapping?: Partial<EventMapping>;
  now?: Date;
}

export interface CollectGoogleOutcome {
  google: SheetGoogle;
  /** 診断（GSC ルール）が使う生データ。連携が無ければ null */
  gscDataset: GscDataset | null;
  /** 診断（GA4 ルール）が使う生データ。連携が無ければ null */
  ga4Dataset: Ga4Dataset | null;
  searchConsole: boolean;
  ga4: boolean;
}

/**
 * Google 連携を使わないときの空の結果（利用者の決定 2026-09-17: Search Console / GA4 は使わない）。
 * collect.ts はこちらを使う。collectGoogle は以前の連携データを読む実装として残してあるだけ。
 */
export function unusedGoogleOutcome(): CollectGoogleOutcome {
  return {
    google: {
      searchConsole: null,
      ga4: null,
      notes: [
        "本サービスは Google Search Console / Google アナリティクスを使いません。検索の状況は「検索パフォーマンス（推定）」でご覧ください",
      ],
    },
    gscDataset: null,
    ga4Dataset: null,
    searchConsole: false,
    ga4: false,
  };
}

export async function collectGoogle(origin: string, deps: CollectGoogleDeps = {}): Promise<CollectGoogleOutcome> {
  const notes: string[] = [];
  let settings: { searchConsoleSiteUrl?: string; ga4PropertyId?: string; eventMapping?: Partial<EventMapping> } = {};
  try {
    settings = await (deps.getSettings ?? getLinkSettings)();
  } catch {
    settings = {};
  }

  let searchConsole: SheetGoogle["searchConsole"] = null;
  let gscDataset: GscDataset | null = null;
  if (!settings.searchConsoleSiteUrl) {
    notes.push("Search Console は連携していません（設定画面で Google アカウントを接続すると、検索クエリと表示回数が加わります）");
  } else if (!siteMatchesOrigin(settings.searchConsoleSiteUrl, origin)) {
    notes.push(`Search Console の連携先（${settings.searchConsoleSiteUrl}）が分析対象と異なるため使っていません`);
  } else {
    // 診断（GSC ルール）と事実シートで同じ取得結果を使う。API の呼び出しを二重にしない
    const client = (deps.searchConsole ?? createSearchConsoleClient)();
    const outcome = await collectGscDataset(client, settings.searchConsoleSiteUrl, { days: DAYS, now: deps.now });
    gscDataset = outcome.dataset;
    for (const n of outcome.notes) notes.push(n);
    if (gscDataset) {
      searchConsole = {
        siteUrl: gscDataset.siteUrl,
        range: gscDataset.range.current,
        totals: gscDataset.totals.current,
        previousTotals: gscDataset.totals.previous,
        queries: gscDataset.queries.current.slice(0, TOP_ROWS).map((r) => ({ query: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
        pages: gscDataset.pages.current.slice(0, TOP_ROWS).map((r) => ({ page: r.key, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position })),
      };
    }
  }

  let ga4: SheetGoogle["ga4"] = null;
  let ga4Dataset: Ga4Dataset | null = null;
  try {
    const resolved = await (deps.ga4 ?? resolveGa4Client)();
    if (!resolved) {
      notes.push("GA4 は連携していません（連携すると訪問後の行動・CTA・フォームの診断が加わります）");
    } else {
      // 診断（GA4 ルール）と事実シートで同じ取得結果を使う
      const outcome = await collectGa4Dataset(resolved.client, { days: DAYS, now: deps.now, mappingOverrides: deps.eventMapping ?? settings.eventMapping });
      ga4Dataset = outcome.dataset;
      for (const n of outcome.notes) notes.push(n);
      if (ga4Dataset) {
        const organic = ga4Dataset.channels.current.find((c) => c.key === ORGANIC_CHANNEL);
        ga4 = {
          propertyId: ga4Dataset.propertyId,
          range: ga4Dataset.range.current,
          organic: {
            sessions: organic?.sessions ?? 0,
            users: organic?.users ?? 0,
            engagementRate: organic ? (shareOf(organic.engagedSessions, organic.sessions) ?? 0) : 0,
            keyEvents: organic?.keyEvents ?? 0,
          },
          all: { sessions: ga4Dataset.totals.current.sessions, keyEvents: ga4Dataset.totals.current.keyEvents },
          landing: ga4Dataset.landing.current.slice(0, TOP_ROWS).map((l) => ({ page: l.key, sessions: l.sessions, keyEvents: l.keyEvents })),
        };
        notes.push("GA4 のプロパティは設定画面で選んだものです（分析対象のサイトと一致しているかは確かめられません）");
      }
    }
  } catch (err) {
    notes.push(`GA4 のデータを取得できませんでした（${err instanceof Error ? err.message : "エラー"}）`);
  }

  return { google: { searchConsole, ga4, notes }, gscDataset, ga4Dataset, searchConsole: searchConsole !== null, ga4: ga4 !== null };
}
