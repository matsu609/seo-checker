/**
 * GET /api/replies/places?placeId=… … 接続前の代替: MEO の保存済み報告書にある公開情報の口コミ（最新 5 件）。
 * Google には問い合わせない（費用ゼロ）。自社として登録した店舗だけ。
 */
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse } from "@/lib/db/supabase";
import { latestReports } from "@/lib/maps/history";
import { listStores } from "@/lib/maps/stores";
import type { PlaceReview } from "@/lib/maps/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export interface RepliesPlacesResponse {
  placeId: string;
  storeName: string;
  reviews: PlaceReview[];
  /** Google マップの口コミ一覧（返信は Google の管理画面で） */
  reviewsUrl: string | null;
  /** 報告書の取得日時（ISO 8601）。無ければ null */
  generatedAt: string | null;
}

export async function GET(request: Request) {
  const denied = await requireAuth({ feature: "replies" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  const placeId = new URL(request.url).searchParams.get("placeId") ?? "";
  if (!PLACE_ID.test(placeId)) return Response.json({ error: "店舗の指定が正しくありません" }, { status: 400 });

  try {
    const own = (await listStores(userId)).find((s) => s.role === "own" && s.placeId === placeId);
    if (!own) return Response.json({ error: "その店舗は自社として登録されていません" }, { status: 404 });
    const entry = (await latestReports(userId, [placeId])).get(placeId) ?? null;
    const body: RepliesPlacesResponse = {
      placeId,
      storeName: own.name,
      reviews: entry?.report.detail.reviews ?? [],
      reviewsUrl: entry?.report.detail.links?.reviews ?? null,
      generatedAt: entry?.report.generatedAt ?? null,
    };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
