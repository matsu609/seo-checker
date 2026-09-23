/**
 * POST /api/search-console/performance
 * Search Console の検索パフォーマンス（クリック・表示回数・CTR・平均掲載順位）を返す。
 *
 * 対象サイトは「Google サーチコンソール連携」の画面で選んだもの（Clerk の privateMetadata）。
 * 期間の合計・前期間の合計・日別・クエリ別・ページ別を 1 回のリクエストで返す。
 * Search Console API は無料（Google Cloud の請求は発生しない）。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { globalCache } from "@/lib/cache";
import { googleErrorResponse } from "@/lib/google/errors";
import { createSearchConsoleClient } from "@/lib/google/search-console/client";
import { totalsOf } from "@/lib/google/search-console/parse";
import { previousRange, SEARCH_CONSOLE_LAG_DAYS, SEARCH_CONSOLE_PERIODS, searchConsoleRange } from "@/lib/google/search-console/period";
import { requireSearchConsoleSite } from "@/lib/google/search-console/settings";
import type { SearchPerformanceResponse } from "@/lib/google/search-console/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** クエリ別・ページ別の取得件数 */
const TOP_ROWS = 100;
const CACHE_TTL_MS = 10 * 60 * 1000;

const BodySchema = z.object({
  days: z.number().int().refine((d) => (SEARCH_CONSOLE_PERIODS as readonly number[]).includes(d), {
    message: `期間は ${SEARCH_CONSOLE_PERIODS.join(" / ")} 日のいずれかで指定してください`,
  }),
  refresh: z.boolean().optional(),
});

/** 1 件あたり数十 KB になりうるので上限は控えめに */
const cache = globalCache<SearchPerformanceResponse>("searchConsolePerformance", CACHE_TTL_MS, 30);

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "search-console" });
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  }
  const { days, refresh } = parsed.data;

  try {
    const siteUrl = await requireSearchConsoleSite();
    const range = searchConsoleRange(days);
    const previous = previousRange(range);
    // 利用者ごとに分ける（同じサイトでも、権限を持たない人に他人の取得結果を返さない）
    const userId = (await currentUserId()) ?? "anonymous";
    const key = `${userId}|${siteUrl}|${range.startDate}|${range.endDate}`;

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
