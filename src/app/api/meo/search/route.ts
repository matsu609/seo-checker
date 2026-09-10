/**
 * POST /api/meo/search（ログイン不要）
 * 無料 MEO 診断の店舗検索。/api/maps/search と同じだが、認証の代わりに回数制限で守る。
 *
 * - 同じ語句は 1 時間キャッシュ（キャッシュに当たった分は上限を消費しない）
 * - クライアント（IP）ごと 30 回 / 時、全体 1,500 回 / 日（FREE_MEO_DAILY_SEARCH_LIMIT）
 */
import { z } from "zod";
import { globalCache } from "@/lib/cache";
import {
  CLIENT_LIMIT_MESSAGE,
  clientKeyOf,
  envInt,
  FREE_LIMIT_MESSAGE,
  FREE_MEO_DAILY_SEARCHES_DEFAULT,
  FREE_MEO_SEARCH_PER_HOUR,
  takeClientToken,
  takeDailyToken,
} from "@/lib/free/ratelimit";
import { isPlacesConfigured, placesErrorResponse, searchPlaces } from "@/lib/maps/client";
import type { PlaceSummary } from "@/lib/maps/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({
  query: z.string().trim().min(1, "店名や地域を入力してください").max(200, "検索語が長すぎます"),
});

export interface FreeMeoSearchResponse {
  query: string;
  places: PlaceSummary[];
  cached: boolean;
}

// 有料の /api/maps/search と同じキャッシュ名（同じ語句なら共有してよい）
const cache = globalCache<PlaceSummary[]>("mapsSearch", 60 * 60 * 1000, 200);
const NO_STORE = { "cache-control": "no-store" };

export async function POST(request: Request) {
  if (!isPlacesConfigured()) {
    return Response.json({ error: "店舗診断は現在準備中です。", code: "not_configured" }, { status: 503, headers: NO_STORE });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  const { query } = parsed.data;
  const key = query.toLowerCase();

  const hit = cache.get(key);
  if (hit) {
    const body: FreeMeoSearchResponse = { query, places: hit, cached: true };
    return Response.json(body, { headers: NO_STORE });
  }

  if (!takeClientToken("meo-search", clientKeyOf(request), FREE_MEO_SEARCH_PER_HOUR)) {
    return Response.json({ error: CLIENT_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  if (!takeDailyToken("meo-search", envInt("FREE_MEO_DAILY_SEARCH_LIMIT", FREE_MEO_DAILY_SEARCHES_DEFAULT))) {
    return Response.json({ error: FREE_LIMIT_MESSAGE, code: "daily_limit" }, { status: 429, headers: NO_STORE });
  }

  try {
    const places = await searchPlaces(query);
    cache.set(key, places);
    const body: FreeMeoSearchResponse = { query, places, cached: false };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return placesErrorResponse(err);
  }
}
