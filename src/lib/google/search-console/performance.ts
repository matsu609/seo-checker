/**
 * 検索パフォーマンスの取得（表示と AI 分析で共有する）。サーバー専用。
 *
 * 合計・前期間の合計・日別・クエリ別・ページ別を 1 回で集める。
 * 同じ条件は 10 分キャッシュする（利用者ごとに分ける。同じサイトでも、
 * 権限を持たない人に他人の取得結果を返さないため）。
 */
import { globalCache } from "@/lib/cache";
import { createSearchConsoleClient } from "./client";
import { totalsOf } from "./parse";
import { previousRange, SEARCH_CONSOLE_LAG_DAYS, searchConsoleRange } from "./period";
import type { SearchPerformanceResponse } from "./types";

/** クエリ別・ページ別の取得件数 */
const TOP_ROWS = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

/** 1 件あたり数十 KB になりうるので上限は控えめに */
const cache = globalCache<SearchPerformanceResponse>("searchConsolePerformance", CACHE_TTL_MS, 30);

export async function loadSearchPerformance(options: { userId: string; siteUrl: string; days: number; refresh?: boolean }): Promise<SearchPerformanceResponse> {
  const { userId, siteUrl, days, refresh } = options;
  const range = searchConsoleRange(days);
  const previous = previousRange(range);
  const key = `${userId}|${siteUrl}|${range.startDate}|${range.endDate}`;

  if (!refresh) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const client = createSearchConsoleClient();
  // 5 本を並行で投げる。合計は dimensions 無しで取る
  // （行の CTR / 掲載順位を足し合わせても正しい合計にならないため）
  const [totalRows, previousRows, daily, queries, pages] = await Promise.all([
    client.query(siteUrl, { ...range, rowLimit: 1 }),
    client.query(siteUrl, { ...previous, rowLimit: 1 }),
    client.query(siteUrl, { ...range, dimensions: ["date"], rowLimit: 400 }),
    client.query(siteUrl, { ...range, dimensions: ["query"], rowLimit: TOP_ROWS }),
    client.query(siteUrl, { ...range, dimensions: ["page"], rowLimit: TOP_ROWS }),
  ]);

  const body: SearchPerformanceResponse = {
    siteUrl,
    range,
    previous,
    totals: totalsOf(totalRows),
    previousTotals: totalsOf(previousRows),
    // 日付は昇順に並べ直す（Google はクリック数順で返すことがある）
    daily: [...daily].sort((a, b) => (a.keys[0] ?? "").localeCompare(b.keys[0] ?? "")),
    queries,
    pages,
    lagDays: SEARCH_CONSOLE_LAG_DAYS,
  };
  cache.set(key, body);
  return body;
}
