/**
 * DELETE /api/maps/stores/[id]
 * 登録店舗を外す。自社の店舗を外すと、その競合もまとめて外れる。
 * 履歴（meo_reports）は残す（店舗を登録し直したときに続きから見られる）。
 */
import { dbErrorResponse } from "@/lib/db/supabase";
import { removeStore } from "@/lib/maps/stores";
import { requireUser } from "@/lib/auth/guard";
import { isUuid } from "@/lib/api/ids";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const userId = await requireUser({ feature: "maps" });
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400 });

  try {
    const removed = await removeStore(userId, id);
    if (removed === 0) return Response.json({ error: "その店舗は登録されていません" }, { status: 404 });
    return Response.json({ ok: true, removed }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
