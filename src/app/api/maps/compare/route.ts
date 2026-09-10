/**
 * GET /api/maps/compare?ownPlaceId=…
 * 自社と、その競合として登録した店舗の「最新の保存済み報告書」を並べて返す。
 *
 * Google には問い合わせない（数字は週 1 回の一斉更新のもの）。
 * まだ 1 回も取れていない店舗は missing に入れる。
 */
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse } from "@/lib/db/supabase";
import { latestReports } from "@/lib/maps/history";
import type { ProfileScore } from "@/lib/maps/score";
import { listStores, type MeoStore } from "@/lib/maps/stores";
import type { PlaceDetail } from "@/lib/maps/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

export interface MapsCompareItem {
  placeId: string;
  /** 登録名（Google の最新の店名は detail.name） */
  name: string;
  role: MeoStore["role"];
  /** この数字を取った日時 */
  generatedAt: string;
  detail: PlaceDetail;
  score: ProfileScore;
}

export interface MapsCompareResponse {
  results: MapsCompareItem[];
  /** まだ報告書が無い店舗（登録直後に取れなかった等。次回の一斉更新で取る） */
  missing: { placeId: string; name: string }[];
}

export async function GET(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });

  const ownPlaceId = new URL(request.url).searchParams.get("ownPlaceId") ?? "";
  if (!PLACE_ID.test(ownPlaceId)) {
    return Response.json({ error: "自社店舗の ID が正しくありません" }, { status: 400 });
  }

  try {
    const stores = await listStores(userId);
    const own = stores.find((s) => s.role === "own" && s.placeId === ownPlaceId);
    if (!own) return Response.json({ error: "その店舗は登録されていません" }, { status: 404 });
    const targets = [own, ...stores.filter((s) => s.role === "competitor" && s.ownPlaceId === ownPlaceId)];

    const latest = await latestReports(
      userId,
      targets.map((s) => s.placeId),
    );
    const results: MapsCompareItem[] = [];
    const missing: MapsCompareResponse["missing"] = [];
    for (const s of targets) {
      const entry = latest.get(s.placeId);
      if (!entry) {
        missing.push({ placeId: s.placeId, name: s.name });
        continue;
      }
      results.push({
        placeId: s.placeId,
        name: s.name,
        role: s.role,
        generatedAt: entry.report.generatedAt,
        detail: entry.report.detail,
        score: entry.report.score,
      });
    }
    const body: MapsCompareResponse = { results, missing };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
