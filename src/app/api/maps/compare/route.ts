/**
 * POST /api/maps/compare
 * 選んだ店舗（自社 + 競合）の詳細を取り、プロフィールの充実度を採点して返す。
 *
 * 詳細は口コミ・紹介文を含むため Places API で最も高い料金区分になる。
 * 店舗ごとに 6 時間キャッシュし、同じ店舗を何度比較しても課金されないようにする。
 * 採点は純粋関数（src/lib/maps/score.ts）で、ここでは呼ぶだけ。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { getPlace, PlacesError, placesErrorResponse } from "@/lib/maps/client";
import { scoreProfile, type ProfileScore } from "@/lib/maps/score";
import { MAX_PLACES, type PlaceDetail } from "@/lib/maps/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** Google の Place ID（ChIJ… のような英数字）。それ以外は Google に投げずに弾く */
const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const BodySchema = z.object({
  placeIds: z
    .array(z.string().regex(PLACE_ID, "店舗の ID が正しくありません"))
    .min(1, "店舗を選んでください")
    .max(MAX_PLACES, `比較できるのは ${MAX_PLACES} 件までです`),
  refresh: z.boolean().optional(),
});

export interface MapsCompareItem {
  placeId: string;
  detail: PlaceDetail;
  score: ProfileScore;
}

export interface MapsCompareResponse {
  results: MapsCompareItem[];
  /** 見つからなかった（閉業で消えた等）店舗の ID */
  missing: string[];
  /** 全件キャッシュから返したか */
  cached: boolean;
}

const cache = globalCache<PlaceDetail>("mapsDetail", CACHE_TTL_MS, 300);

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;

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
  const { refresh } = parsed.data;
  const placeIds = [...new Set(parsed.data.placeIds)];

  try {
    let allCached = true;
    const missing: string[] = [];
    const details = await Promise.all(
      placeIds.map(async (id): Promise<PlaceDetail | null> => {
        if (!refresh) {
          const hit = cache.get(id);
          if (hit) return hit;
        }
        allCached = false;
        try {
          const detail = await getPlace(id);
          cache.set(id, detail);
          return detail;
        } catch (err) {
          // 1 件が消えていても他は出す。それ以外のエラー（キー・上限）は全体を止める
          if (err instanceof PlacesError && err.code === "not_found") {
            missing.push(id);
            return null;
          }
          throw err;
        }
      }),
    );

    const now = new Date();
    const results: MapsCompareItem[] = [];
    for (const detail of details) {
      if (!detail) continue;
      results.push({ placeId: detail.id, detail, score: scoreProfile(detail, now) });
    }
    const body: MapsCompareResponse = { results, missing, cached: allCached };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return placesErrorResponse(err);
  }
}
