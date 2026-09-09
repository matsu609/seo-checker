/**
 * POST /api/maps/search
 * 店名・地域などの文字列で Google マップの候補を探す（自社・競合を選ぶため）。
 *
 * 同じ語句は 1 時間キャッシュする（候補一覧は短時間では変わらず、検索のたびに
 * 課金されるため）。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { placesErrorResponse, searchPlaces } from "@/lib/maps/client";
import type { PlaceSummary } from "@/lib/maps/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const CACHE_TTL_MS = 60 * 60 * 1000;

const BodySchema = z.object({
  query: z.string().trim().min(1, "店名や地域を入力してください").max(200, "検索語が長すぎます"),
});

export interface MapsSearchResponse {
  query: string;
  places: PlaceSummary[];
  cached: boolean;
}

const cache = globalCache<PlaceSummary[]>("mapsSearch", CACHE_TTL_MS, 200);

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
  const { query } = parsed.data;
  const key = query.toLowerCase();

  const hit = cache.get(key);
  if (hit) {
    const body: MapsSearchResponse = { query, places: hit, cached: true };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  }

  try {
    const places = await searchPlaces(query);
    cache.set(key, places);
    const body: MapsSearchResponse = { query, places, cached: false };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return placesErrorResponse(err);
  }
}
