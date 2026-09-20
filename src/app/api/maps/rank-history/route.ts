/**
 * GET /api/maps/rank-history?placeId=… … 自社店舗の Google マップ検索順位の推移（毎週の報告書から）。
 */
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { allReportsForPlace } from "@/lib/maps/history";
import { rankSeriesFromReports, type RankHistory } from "@/lib/maps/rank-history";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export interface MapsRankHistoryResponse {
  enabled: boolean;
  history: RankHistory;
}

export async function GET(request: Request) {
  const userId = await requireUser({ feature: "maps" });
  if (userId instanceof Response) return userId;
  const placeId = new URL(request.url).searchParams.get("placeId") ?? "";
  if (!PLACE_ID.test(placeId)) return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400, headers: NO_STORE });
  if (!isSupabaseConfigured()) {
    const body: MapsRankHistoryResponse = { enabled: false, history: { limit: 20, series: [], dates: [] } };
    return Response.json(body, { headers: NO_STORE });
  }
  try {
    const reports = await allReportsForPlace(userId, placeId, 50);
    const body: MapsRankHistoryResponse = { enabled: true, history: rankSeriesFromReports(reports) };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
