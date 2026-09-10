/**
 * MEO 診断報告書の履歴（Supabase）。
 *
 * GET … { enabled, items }。?placeId= でその店舗だけ。
 *
 * 保存は利用者が押すものではなく、店舗の登録直後（/api/maps/stores）と
 * 週 1 回の一斉更新（/api/cron/maps-refresh）だけがサーバー側で行う。
 */
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { listMeoReports, type MeoHistoryItem } from "@/lib/maps/history";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export interface MapsHistoryListResponse {
  enabled: boolean;
  items: MeoHistoryItem[];
}

export async function GET(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;

  const headers = { "cache-control": "no-store" };
  if (!isSupabaseConfigured()) {
    const body: MapsHistoryListResponse = { enabled: false, items: [] };
    return Response.json(body, { headers });
  }
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers });

  const placeId = new URL(request.url).searchParams.get("placeId");
  if (placeId !== null && !PLACE_ID.test(placeId)) {
    return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400, headers });
  }

  try {
    const items = await listMeoReports(userId, placeId ?? undefined);
    const body: MapsHistoryListResponse = { enabled: true, items };
    return Response.json(body, { headers });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
