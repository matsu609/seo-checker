/**
 * /api/store … ブラウザ側ストアのサーバー保存（src/lib/db/user-stores.ts）。ログイン必須。
 *
 *   GET    → { stores: { name: value, … } }  ログイン中のユーザーの全ストア
 *   PUT    { name, value } → 204               保存
 *   DELETE { name } → 204                      削除
 *
 * 代理ログイン中（運用者がお客様の画面を見ている間）は書き込みを 403 で断る。
 * 見るための機能で、お客様のデータを書き換える機能ではないため。
 * Supabase が未設定なら 503（code: not_configured）。クライアントはそれを見て同期を止める。
 */
import { isImpersonating } from "@/lib/admin/impersonate";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { listUserStores, removeUserStore, saveUserStore } from "@/lib/db/user-stores";
import { isSyncedStoreName } from "@/lib/store/sync-rules";

export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = { "cache-control": "no-store" } as const;
/** 1 ストアの上限（JSON の文字数）。履歴系のストアでもこれに収まる */
const MAX_VALUE_CHARS = 2_000_000;

async function gate(write: boolean): Promise<{ userId: string } | Response> {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isSupabaseConfigured()) return Response.json({ error: "保存機能が設定されていません", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  if (write && (await isImpersonating())) {
    return Response.json({ error: "代理ログイン中はお客様のデータを書き換えられません", code: "impersonating" }, { status: 403, headers: NO_STORE });
  }
  return { userId };
}

export async function GET() {
  const g = await gate(false);
  if (g instanceof Response) return g;
  try {
    const stores = await listUserStores(g.userId);
    return Response.json({ stores }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function PUT(request: Request) {
  const g = await gate(true);
  if (g instanceof Response) return g;
  const body = (await request.json().catch(() => null)) as { name?: unknown; value?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  if (!isSyncedStoreName(name) || body?.value === undefined) {
    return Response.json({ error: "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  if (JSON.stringify(body.value).length > MAX_VALUE_CHARS) {
    return Response.json({ error: "保存する量が多すぎます" }, { status: 413, headers: NO_STORE });
  }
  try {
    await saveUserStore(g.userId, name, body.value);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  const g = await gate(true);
  if (g instanceof Response) return g;
  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const name = typeof body?.name === "string" ? body.name : "";
  if (!isSyncedStoreName(name)) return Response.json({ error: "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  try {
    await removeUserStore(g.userId, name);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
