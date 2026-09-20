/**
 * GET /api/cron/maps-refresh
 * 登録された全店舗の一斉更新（旧パス。r127 から日次の /api/cron/daily の月曜分に統合した）。
 *
 * Vercel の Hobby プランは Cron が 2 本までなので、vercel.json からは外してある。
 * 手動で叩く（curl + CRON_SECRET）用に残す。中身は src/lib/maps/refresh-job.ts。
 *
 * ログインではなく CRON_SECRET で守る。未設定なら一切動かさない（誰でも叩けて Google の費用が出る状態にしない）。
 * src/lib/auth/routes.ts で公開 API に入れてあるので、Clerk の 401 は返らない。
 */
import { isCronAuthorized, isCronConfigured } from "@/lib/auth/cron";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { runMapsRefresh } from "@/lib/maps/refresh-job";

export const runtime = "nodejs";
export const maxDuration = 300;

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

  const summary = await runMapsRefresh({ budgetMs: BUDGET_MS, signal: request.signal });
  console.info("[maps-refresh]", summary);
  return Response.json(summary, { status: summary.aborted ? 502 : 200, headers: { "cache-control": "no-store" } });
}
