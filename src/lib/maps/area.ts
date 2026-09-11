/**
 * 周辺の同業との相対位置（r29）。純粋関数。
 *
 * 店舗の位置から半径 AREA_RADIUS_M の同じメインカテゴリの店舗を人気順で最大 20 件取り
 * （Nearby Search、Enterprise 区分）、その中で自社の評価・口コミ件数が何番目かを出す。
 * 競合を登録していなくても「地域の中での立ち位置」が分かる。
 */
import type { NearbyPlace } from "./parse";
import type { PlaceDetail } from "./types";

export const AREA_RADIUS_M = 1500;
export const AREA_LIMIT = 20;
export const AREA_TOP = 5;

export interface AreaResult {
  radiusM: number;
  primaryType: string | null;
  measuredAt: string;
  /** 周辺の同業の数（自社を除く） */
  count: number;
  own: { rating: number | null; ratingCount: number | null };
  /** 自社 + 周辺の中での順位（1 始まり、同点は同順位）。自社の値が無ければ null */
  ratingRank: number | null;
  countRank: number | null;
  /** 周辺の平均評価と口コミ件数の中央値（自社を除く。無ければ null） */
  avgRating: number | null;
  medianCount: number | null;
  /** 周辺の上位（口コミ件数の多い順） */
  top: NearbyPlace[];
  /** 取得できなかったときの理由 */
  error: string | null;
}

function rankAmong(own: number | null, others: readonly (number | null)[]): number | null {
  if (own === null) return null;
  const above = others.filter((v): v is number => v !== null && v > own).length;
  return above + 1;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function buildArea(own: PlaceDetail, nearby: readonly NearbyPlace[], now = new Date(), radiusM = AREA_RADIUS_M): AreaResult {
  const others = nearby.filter((n) => n.id !== own.id);
  const ratings = others.map((n) => n.rating).filter((v): v is number => v !== null);
  const counts = others.map((n) => n.ratingCount).filter((v): v is number => v !== null);
  return {
    radiusM,
    primaryType: own.primaryType ?? null,
    measuredAt: now.toISOString(),
    count: others.length,
    own: { rating: own.rating, ratingCount: own.ratingCount },
    ratingRank: others.length > 0 ? rankAmong(own.rating, others.map((n) => n.rating)) : null,
    countRank: others.length > 0 ? rankAmong(own.ratingCount, others.map((n) => n.ratingCount)) : null,
    avgRating: ratings.length > 0 ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    medianCount: median(counts),
    top: [...others].sort((a, b) => (b.ratingCount ?? -1) - (a.ratingCount ?? -1)).slice(0, AREA_TOP),
    error: null,
  };
}

export function areaError(own: PlaceDetail, message: string, now = new Date(), radiusM = AREA_RADIUS_M): AreaResult {
  return {
    radiusM,
    primaryType: own.primaryType ?? null,
    measuredAt: now.toISOString(),
    count: 0,
    own: { rating: own.rating, ratingCount: own.ratingCount },
    ratingRank: null,
    countRank: null,
    avgRating: null,
    medianCount: null,
    top: [],
    error: message,
  };
}

/** 「上位 X%」（順位 / 総数）。総数は自社を含む */
export function topPercent(rank: number | null, count: number): number | null {
  if (rank === null || count <= 0) return null;
  return Math.max(1, Math.round((rank / (count + 1)) * 100));
}
