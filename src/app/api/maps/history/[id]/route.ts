/**
 * 保存済みの MEO 診断報告書 1 件。
 *
 * GET    … { item, report }（本文つき）。自分の行でなければ 404
 * PATCH  … { aiCommentary } を書き足す（画面で生成した AI 総評を残す）
 * DELETE … 削除。自分の行でなければ 404
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { AiCommentarySchema, attachAiCommentary, deleteMeoReport, getMeoReport, type MeoHistoryEntry } from "@/lib/maps/history";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Context = { params: Promise<{ id: string }> };

export type MapsHistoryEntryResponse = MeoHistoryEntry;

async function prepare(context: Context): Promise<{ userId: string; id: string } | Response> {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "保存機能は設定されていません", code: "not_configured" }, { status: 503 });
  }
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: "履歴の ID が正しくありません" }, { status: 400 });
  return { userId, id };
}

export async function GET(_request: Request, context: Context) {
  const ready = await prepare(context);
  if (ready instanceof Response) return ready;
  try {
    const entry = await getMeoReport(ready.userId, ready.id);
    if (!entry) return Response.json({ error: "その履歴はありません" }, { status: 404 });
    return Response.json(entry satisfies MapsHistoryEntryResponse, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

const PatchSchema = z.object({ aiCommentary: AiCommentarySchema.min(1) });

export async function PATCH(request: Request, context: Context) {
  const ready = await prepare(context);
  if (ready instanceof Response) return ready;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "総評の形式が正しくありません" }, { status: 400 });
  try {
    const ok = await attachAiCommentary(ready.userId, ready.id, parsed.data.aiCommentary);
    if (!ok) return Response.json({ error: "その履歴はありません" }, { status: 404 });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(_request: Request, context: Context) {
  const ready = await prepare(context);
  if (ready instanceof Response) return ready;
  try {
    const ok = await deleteMeoReport(ready.userId, ready.id);
    if (!ok) return Response.json({ error: "その履歴はありません" }, { status: 404 });
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
