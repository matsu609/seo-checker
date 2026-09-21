/**
 * GET /api/rank/auto … 自動計測（毎週火曜）の結果と予定。ログイン必須。
 *
 * 画面はここで返した snapshots を端末側の履歴に取り込む（同じ語・同じ日は後勝ち）。
 * 応答: { enabled, snapshots, nextRunAt, lastRunDate, limit }
 */
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { scheduleOf } from "@/lib/jobs/schedule";
import { isAdmin } from "@/lib/admin/guard";
import { getCurrentPlan } from "@/lib/plans/current";
import { rankAutoLimit } from "@/lib/rank/auto";
import { lastRankRunDate, listRankSnapshots } from "@/lib/rank/server-store";
import type { RankSnapshot } from "@/lib/rank/store";
import { isSerpEnabled } from "@/lib/serp";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface RankAutoResponse {
  /** 自動計測が動く条件（Supabase + SerpApi）がそろっているか */
  enabled: boolean;
  snapshots: RankSnapshot[];
  nextRunAt: string;
  lastRunDate: string | null;
  /** このプランで毎週測る語数の上限 */
  limit: number;
}

export async function GET() {
  const userId = await requireUser({ feature: "rank" });
  if (userId instanceof Response) return userId;
  const nextRunAt = scheduleOf("rank-weekly").next(new Date()).toISOString();
  const { plan } = await getCurrentPlan();
  // 運用者は契約が無くてもいちばん上の段（定期処理の側と同じ扱い）
  const limit = rankAutoLimit(plan, await isAdmin());
  if (!isSupabaseConfigured()) {
    const body: RankAutoResponse = { enabled: false, snapshots: [], nextRunAt, lastRunDate: null, limit };
    return Response.json(body, { headers: NO_STORE });
  }
  try {
    const [snapshots, lastRunDate] = await Promise.all([listRankSnapshots(userId), lastRankRunDate(userId)]);
    const body: RankAutoResponse = { enabled: isSerpEnabled(), snapshots, nextRunAt, lastRunDate, limit };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
