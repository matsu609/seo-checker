/**
 * 店舗の詳細を、プロセス内キャッシュ越しに取る。サーバー専用。
 *
 * 詳細は口コミ・紹介文を含むため Places API で最も高い料金区分になる。
 * レポートと競合比較の両方から同じキャッシュを使い、同じ店舗を何度見ても
 * 一定時間は課金されないようにする。
 */
import { globalCache } from "@/lib/cache";
import { getPlace, searchNearby, searchRank } from "./client";
import type { NearbyPlace, RankedPlace } from "./parse";
import type { LatLng, PlaceDetail } from "./types";

export const DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const cache = globalCache<PlaceDetail>("mapsDetail", DETAIL_CACHE_TTL_MS, 300);

export interface CachedDetail {
  detail: PlaceDetail;
  cached: boolean;
}

/** キャッシュにあれば返す（Google には問い合わせない）。無料診断が上限の判定に使う */
export function peekPlaceCached(placeId: string): PlaceDetail | null {
  return cache.get(placeId) ?? null;
}

/** refresh を付けるとキャッシュを飛ばして取り直す */
export async function getPlaceCached(placeId: string, refresh = false): Promise<CachedDetail> {
  if (!refresh) {
    const hit = cache.get(placeId);
    if (hit) return { detail: hit, cached: true };
  }
  const detail = await getPlace(placeId);
  cache.set(placeId, detail);
  return { detail, cached: false };
}

/* ───────────── r29: 順位・周辺（同じ 6 時間キャッシュ） ───────────── */

const rankCache = globalCache<RankedPlace[]>("mapsRank", DETAIL_CACHE_TTL_MS, 1000);
const nearbyCache = globalCache<NearbyPlace[]>("mapsNearby", DETAIL_CACHE_TTL_MS, 300);

function centerKey(center: LatLng): string {
  return `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`;
}

/** 順位計測の検索（キーワード × 位置で 6 時間キャッシュ） */
export async function searchRankCached(query: string, center: LatLng, radiusM: number, limit: number): Promise<RankedPlace[]> {
  const key = `${query}@${centerKey(center)}/${radiusM}/${limit}`;
  const hit = rankCache.get(key);
  if (hit) return hit;
  const results = await searchRank(query, center, radiusM, limit);
  rankCache.set(key, results);
  return results;
}

/** 周辺の同業（店舗ごとに 6 時間キャッシュ） */
export async function searchNearbyCached(placeId: string, center: LatLng, primaryType: string | null, radiusM: number, limit: number): Promise<NearbyPlace[]> {
  const key = `${placeId}/${primaryType ?? "-"}/${radiusM}/${limit}`;
  const hit = nearbyCache.get(key);
  if (hit) return hit;
  const results = await searchNearby(center, primaryType, radiusM, limit);
  nearbyCache.set(key, results);
  return results;
}
