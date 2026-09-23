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
import { googleErrorResponse } from "@/lib/google/errors";
import { SEARCH_CONSOLE_PERIODS } from "@/lib/google/search-console/period";
import { loadSearchPerformance } from "@/lib/google/search-console/performance";
import { requireSearchConsoleSite } from "@/lib/google/search-console/settings";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  days: z.number().int().refine((d) => (SEARCH_CONSOLE_PERIODS as readonly number[]).includes(d), {
    message: `期間は ${SEARCH_CONSOLE_PERIODS.join(" / ")} 日のいずれかで指定してください`,
  }),
  refresh: z.boolean().optional(),
});

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
    const userId = (await currentUserId()) ?? "anonymous";
    const body = await loadSearchPerformance({ userId, siteUrl, days, refresh });
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
