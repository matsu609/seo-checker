/**
 * 自社店舗の報告書に、検索順位（rank.ts）と周辺の同業（area.ts）を付ける。サーバー専用。
 *
 * 呼ぶ場所: 店舗の登録直後、週 1 回の一斉更新、オーナー情報の保存（キーワードが増えたときだけ検索）。
 * 位置（location）が無い店舗（r28 より前の保存分や出張型）は計測しない。
 * Google のエラーは報告書の中に error として残し、保存自体は止めない。
 */
import { areaError, buildArea, AREA_LIMIT, AREA_RADIUS_M, type AreaResult } from "./area";
import { searchNearbyCached, searchRankCached } from "./fetch";
import type { MeoReport } from "./report";
import { measureRanks, type MeoRankResult } from "./rank";
import { listStores } from "./stores";
import type { PlaceDetail } from "./types";

export interface EnrichOptions {
  /** 使い回す前回の報告書（同じキーワードは検索しない） */
  reuse?: MeoReport | null;
  /** 前回の報告書（順位の前回値と、周辺を取り直さないときの値に使う） */
  previous?: MeoReport | null;
  /** 周辺の同業を取り直すか（false なら previous の値を引き継ぐ） */
  refreshArea: boolean;
  now?: () => Date;
}

export interface Enrichment {
  rank: MeoRankResult | null;
  area: AreaResult | null;
}

export async function enrichOwnReport(userId: string, detail: PlaceDetail, keywords: readonly string[], options: EnrichOptions): Promise<Enrichment> {
  const now = options.now ?? (() => new Date());
  const center = detail.location ?? null;
  if (!center) return { rank: null, area: null };

  let rank: MeoRankResult | null = null;
  if (keywords.length > 0) {
    let competitors: { placeId: string; name: string }[] = [];
    try {
      const stores = await listStores(userId);
      competitors = stores.filter((s) => s.role === "competitor" && s.ownPlaceId === detail.id).map((s) => ({ placeId: s.placeId, name: s.name }));
    } catch (err) {
      console.error("[maps] 競合一覧の取得に失敗（順位は自社だけ計測）", { userId, placeId: detail.id, err });
    }
    rank = await measureRanks({
      keywords,
      ownPlaceId: detail.id,
      competitors,
      center,
      reuse: options.reuse?.rank ?? null,
      previous: options.previous?.rank ?? null,
      search: searchRankCached,
      now,
    });
  }

  let area: AreaResult | null = options.previous?.area ?? null;
  if (options.refreshArea) {
    try {
      const nearby = await searchNearbyCached(detail.id, center, detail.primaryType ?? null, AREA_RADIUS_M, AREA_LIMIT);
      area = buildArea(detail, nearby, now(), AREA_RADIUS_M);
    } catch (err) {
      area = areaError(detail, err instanceof Error ? err.message : "周辺の店舗を取得できませんでした", now(), AREA_RADIUS_M);
    }
  }
  return { rank, area };
}
