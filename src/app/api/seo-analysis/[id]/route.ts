/**
 * GET / DELETE /api/seo-analysis/[id] — 1 件の分析（事実シート・AI 分析・セカンドオピニオン）。
 */
import { NextRequest } from "next/server";
import { dbErrorResponse } from "@/lib/db/supabase";
import { deleteRun, getRun } from "@/lib/seo-analysis/runs";
import { requireUser } from "@/lib/auth/guard";
import { isUuid } from "@/lib/api/ids";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const userId = await requireUser({ feature: "seo-analysis" });
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "ID が不正です" }, { status: 400 });
  try {
    const run = await getRun(userId, id);
    if (!run) return Response.json({ error: "分析が見つかりません" }, { status: 404 });
    return Response.json({ run }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const userId = await requireUser({ feature: "seo-analysis" });
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "ID が不正です" }, { status: 400 });
  try {
    await deleteRun(userId, id);
    return new Response(null, { status: 204 });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
