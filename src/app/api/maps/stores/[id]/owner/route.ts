/**
 * /api/maps/stores/[id]/owner … 自社店舗のオーナー申告（公開情報では取れない 9 項目）。
 *
 * GET    … { owner: MeoOwnerData | null }
 * PUT    … { input: MeoOwnerInput } を保存し、最新の報告書を申告込みで採点し直す
 * DELETE … 申告を消し、最新の報告書を公開情報だけで採点し直す
 *
 * 競合の店舗には申告できない（自社の行だけ）。採点し直しは保存済みの Google 情報を
 * 使うので Google には問い合わせない（費用ゼロ）。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse } from "@/lib/db/supabase";
import { rescoreLatestReport, type MeoHistoryEntry } from "@/lib/maps/history";
import { MeoOwnerInputSchema, type MeoOwnerData } from "@/lib/maps/owner-input";
import { deleteOwnerInput, getOwnerInput, putOwnerInput } from "@/lib/maps/owner-store";
import { getStore, type MeoStore } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({ input: MeoOwnerInputSchema });

export interface MapsOwnerResponse {
  owner: MeoOwnerData | null;
}

export interface MapsOwnerSaveResponse extends MapsOwnerResponse {
  /** 採点し直した最新の報告書（報告書がまだ無い店舗なら null） */
  rescored: MeoHistoryEntry | null;
}

type Ctx = { params: Promise<{ id: string }> };

async function ownStore(userId: string, id: string): Promise<MeoStore | Response> {
  if (!UUID.test(id)) return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400 });
  const store = await getStore(userId, id);
  if (!store) return Response.json({ error: "その店舗は登録されていません" }, { status: 404 });
  if (store.role !== "own") return Response.json({ error: "オーナー情報は自社の店舗にだけ入力できます" }, { status: 400 });
  return store;
}

async function guard(): Promise<string | Response> {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  return userId;
}

export async function GET(_request: Request, context: Ctx) {
  const userId = await guard();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  try {
    const store = await ownStore(userId, id);
    if (store instanceof Response) return store;
    const body: MapsOwnerResponse = { owner: await getOwnerInput(userId, store.placeId) };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function PUT(request: Request, context: Ctx) {
  const userId = await guard();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  }

  try {
    const store = await ownStore(userId, id);
    if (store instanceof Response) return store;
    const owner = await putOwnerInput(userId, store.placeId, parsed.data.input);
    const rescored = await rescoreLatestReport(userId, store.placeId, owner);
    const body: MapsOwnerSaveResponse = { owner, rescored };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const userId = await guard();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  try {
    const store = await ownStore(userId, id);
    if (store instanceof Response) return store;
    await deleteOwnerInput(userId, store.placeId);
    const rescored = await rescoreLatestReport(userId, store.placeId, null);
    const body: MapsOwnerSaveResponse = { owner: null, rescored };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
