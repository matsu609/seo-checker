/**
 * 登録店舗（自社・競合）。
 *
 * GET  … { stores, nextRefreshAt }
 * POST … { placeId, name, ownPlaceId? } を登録し、その場で 1 回だけ詳細を取って履歴に保存する
 *        （1 週間待たせないため。以後は週 1 回の一斉更新だけ。手動の取り直しは無い）。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse } from "@/lib/db/supabase";
import { PlacesError } from "@/lib/maps/client";
import { getPlaceCached } from "@/lib/maps/fetch";
import { saveMeoReport } from "@/lib/maps/history";
import { nextRefreshAt } from "@/lib/maps/refresh";
import { buildMeoReport } from "@/lib/maps/report";
import { addStore, listStores, markRefreshed, MAX_COMPETITORS_PER_STORE, MAX_OWN_STORES, type MeoStore } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const BodySchema = z.object({
  placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません"),
  name: z.string().trim().min(1, "店名がありません").max(200),
  ownPlaceId: z.string().regex(PLACE_ID, "自社店舗の ID が正しくありません").optional(),
});

export interface MapsStoresResponse {
  stores: MeoStore[];
  /** 次の一斉更新（ISO 8601） */
  nextRefreshAt: string;
}

export interface MapsStoreAddResponse {
  store: MeoStore;
  /** その場で取得できたか（false なら次回の一斉更新で取る） */
  fetched: boolean;
  fetchError: string | null;
}

export async function GET() {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });

  try {
    const body: MapsStoresResponse = { stores: await listStores(userId), nextRefreshAt: nextRefreshAt().toISOString() };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });

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
  const { placeId, name } = parsed.data;
  const ownPlaceId = parsed.data.ownPlaceId ?? "";
  if (ownPlaceId === placeId) {
    return Response.json({ error: "自社の店舗を競合には登録できません" }, { status: 400 });
  }

  try {
    const stores = await listStores(userId);
    if (ownPlaceId === "") {
      const owns = stores.filter((s) => s.role === "own");
      if (!owns.some((s) => s.placeId === placeId) && owns.length >= MAX_OWN_STORES) {
        return Response.json({ error: `自社の店舗は ${MAX_OWN_STORES} 件まで登録できます` }, { status: 400 });
      }
    } else {
      if (!stores.some((s) => s.role === "own" && s.placeId === ownPlaceId)) {
        return Response.json({ error: "先に自社の店舗を登録してください" }, { status: 400 });
      }
      const siblings = stores.filter((s) => s.role === "competitor" && s.ownPlaceId === ownPlaceId);
      if (!siblings.some((s) => s.placeId === placeId) && siblings.length >= MAX_COMPETITORS_PER_STORE) {
        return Response.json({ error: `競合は 1 店舗あたり ${MAX_COMPETITORS_PER_STORE} 件まで登録できます` }, { status: 400 });
      }
    }

    const store = await addStore(userId, { placeId, name, ownPlaceId });

    // 登録直後の 1 回だけその場で取る（6 時間キャッシュ越し。登録と削除を繰り返しても課金されない）
    let fetched = false;
    let fetchError: string | null = null;
    try {
      const { detail } = await getPlaceCached(placeId);
      const now = new Date();
      await saveMeoReport(userId, { ...buildMeoReport(detail, now), aiCommentary: null });
      await markRefreshed(placeId, now);
      fetched = true;
    } catch (err) {
      fetchError = err instanceof PlacesError ? err.message : "店舗情報を取得できませんでした。次回の一斉更新で取得します";
    }
    const body: MapsStoreAddResponse = { store, fetched, fetchError };
    return Response.json(body, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
