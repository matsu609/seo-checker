/**
 * GET / DELETE /api/seo-analysis/[id] — 1 件の分析（事実シート・AI 分析・セカンドオピニオン）。
 */
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse } from "@/lib/db/supabase";
import { deleteRun, getRun } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const denied = await requireAuth({ feature: "seo-analysis" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "ID が不正です" }, { status: 400 });
  try {
    const run = await getRun(userId, id);
    if (!run) return Response.json({ error: "分析が見つかりません" }, { status: 404 });
    return Response.json({ run }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const denied = await requireAuth({ feature: "seo-analysis" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "ID が不正です" }, { status: 400 });
  try {
    await deleteRun(userId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
