/**
 * DELETE /api/maps/stores/[id]
 * 登録店舗を外す。自社の店舗を外すと、その競合もまとめて外れる。
 * 履歴（meo_reports）は残す（店舗を登録し直したときに続きから見られる）。
 */
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse } from "@/lib/db/supabase";
import { removeStore } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400 });

  try {
    const removed = await removeStore(userId, id);
    if (removed === 0) return Response.json({ error: "その店舗は登録されていません" }, { status: 404 });
    return Response.json({ ok: true, removed }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
