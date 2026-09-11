/**
 * GET /api/cron/maps-refresh
 * 登録された全店舗の一斉更新。Vercel の Cron（vercel.json: 毎週月曜 5:00 JST）が叩く。
 *
 * ログインではなく CRON_SECRET で守る（Vercel は Cron の呼び出しに
 * `Authorization: Bearer <CRON_SECRET>` を自動で付ける）。
 * CRON_SECRET が未設定なら一切動かさない（誰でも叩けて Google の費用が出る状態にしない）。
 * src/lib/auth/routes.ts で公開 API に入れてあるので、Clerk の 401 は返らない。
 */
import { isCronAuthorized, isCronConfigured } from "@/lib/auth/cron";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { getPlace } from "@/lib/maps/client";
import { saveMeoReport } from "@/lib/maps/history";
import { getOwnerInputOrNull } from "@/lib/maps/owner-store";
import { refreshStores, type RefreshSummary } from "@/lib/maps/refresh";
import { listStoresDue, markRefreshed } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 1 回で読む行数（利用者 × 店舗）。超えた分は次回（時間切れと同じ扱い） */
const ROW_LIMIT = 2000;
/** maxDuration より短く切り上げる（保存の途中で切られないように） */
const BUDGET_MS = 240_000;

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return Response.json({ error: "CRON_SECRET が未設定のため一斉更新は無効です" }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase が未設定のため一斉更新は無効です" }, { status: 503 });
  }

  const summary: RefreshSummary = await refreshStores(
    {
      listDue: listStoresDue,
      getDetail: getPlace,
      save: (userId, report) => saveMeoReport(userId, { ...report, aiCommentary: null }),
      markRefreshed,
      getOwnerInput: getOwnerInputOrNull,
    },
    { limit: ROW_LIMIT, budgetMs: BUDGET_MS },
  );
  console.info("[maps-refresh]", summary);
  return Response.json(summary, { status: summary.aborted ? 502 : 200, headers: { "cache-control": "no-store" } });
}
