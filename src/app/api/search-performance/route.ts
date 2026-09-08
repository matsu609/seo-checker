/**
 * POST /api/search-performance
 * Search Console の検索パフォーマンス（クリック・表示・CTR・平均掲載順位）を返す。
 *
 * 対象サイトは、ユーザーが設定画面で選んだもの（Clerk の privateMetadata）。
 * 期間の合計・前期間の合計・日別・クエリ別・ページ別を 1 回のリクエストで返す。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { previousRange } from "@/lib/ga4/period";
import { googleErrorResponse } from "@/lib/google/errors";
import { createSearchConsoleClient } from "@/lib/google/search-console/client";
import { searchConsoleRange, SEARCH_CONSOLE_LAG_DAYS } from "@/lib/google/search-console/period";
import { totalsOf } from "@/lib/google/search-console/parse";
import type { SearchAnalyticsRow } from "@/lib/google/search-console/types";
import { requireSearchConsoleSite } from "@/lib/google/settings";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 期間の選択肢（GA4 側の PERIOD_PRESETS と揃える） */
const ALLOWED_DAYS = [7, 28, 90, 180, 365] as const;
/** クエリ別・ページ別の取得件数 */
const TOP_ROWS = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

const BodySchema = z.object({
  days: z.number().int().refine((d) => (ALLOWED_DAYS as readonly number[]).includes(d), {
    message: `期間は ${ALLOWED_DAYS.join(" / ")} 日のいずれかで指定してください`,
  }),
  refresh: z.boolean().optional(),
});

export interface SearchPerformanceResponse {
  siteUrl: string;
  range: { startDate: string; endDate: string };
  previous: { startDate: string; endDate: string };
  /** 期間の合計 */
  totals: Omit<SearchAnalyticsRow, "keys">;
  /** 前期間の合計（比較用） */
  previousTotals: Omit<SearchAnalyticsRow, "keys">;
  /** 日別（keys[0] が日付） */
  daily: SearchAnalyticsRow[];
  /** クリックの多い順のクエリ */
  queries: SearchAnalyticsRow[];
  /** クリックの多い順のページ */
  pages: SearchAnalyticsRow[];
  /** データ確定の遅れ（画面の注記に出す） */
  lagDays: number;
}

/** 1 件あたり数百 KB になりうるので上限は控えめに */
const cache = globalCache<SearchPerformanceResponse>("searchPerformance", CACHE_TTL_MS, 30);

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "入力が正しくありません" },
      { status: 400 },
    );
  }
  const { days, refresh } = parsed.data;

  try {
    const siteUrl = await requireSearchConsoleSite();
    const range = searchConsoleRange(days);
    const previous = previousRange(range);
    const key = `gsc|${siteUrl}|${range.startDate}|${range.endDate}`;

    if (!refresh) {
      const hit = cache.get(key);
      if (hit) return Response.json(hit, { headers: { "cache-control": "no-store" } });
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
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
