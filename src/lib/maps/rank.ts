/**
 * 検索順位の計測（r29）。純粋なロジックと、検索関数を注入して回すループ。
 *
 * 店舗の位置を中心に、対策キーワードごとに Google マップ検索（Text Search）を 1 回ずつ叩き、
 * 結果の並びの中で自社と登録済みの競合が何番目かを記録する。Google の「ローカル検索の順位」
 * そのものではなく Places API が返す並び（擬似順位）。場所・端末で変わる旨を画面に書く。
 *
 * 費用: キーワード 1 本 = Text Search 1 回（Pro 区分、月 5,000 回まで無料）。
 * 毎週の一斉更新と、キーワードを新しく入れたときだけ叩く（同じキーワードは前回の結果を使い回す）。
 */
import type { RankedPlace } from "./parse";
import type { LatLng } from "./types";

export const RANK_LIMIT = 20;
export const RANK_RADIUS_M = 3000;
export const RANK_TOP = 3;

export interface RankCompetitor {
  placeId: string;
  name: string;
  rank: number | null;
}

export interface RankKeywordResult {
  keyword: string;
  /** 自社の順位（1〜RANK_LIMIT）。圏内に無ければ null */
  rank: number | null;
  /** 前回の順位（前回の報告書に同じキーワードがあれば。無ければ undefined） */
  previous?: number | null;
  /** 上位 RANK_TOP 件 */
  top: RankedPlace[];
  competitors: RankCompetitor[];
  /** 結果の件数（0 なら検索に何も出なかった） */
  total: number;
  measuredAt: string;
  /** 取得できなかったときの理由（このときは rank = null） */
  error: string | null;
}

export interface MeoRankResult {
  center: LatLng;
  radiusM: number;
  limit: number;
  keywords: RankKeywordResult[];
}

/** 並びの中で placeId が何番目か（1 始まり）。無ければ null */
export function rankOf(results: readonly RankedPlace[], placeId: string): number | null {
  const i = results.findIndex((r) => r.id === placeId);
  return i < 0 ? null : i + 1;
}

export interface MeasureRanksParams {
  keywords: readonly string[];
  ownPlaceId: string;
  competitors: readonly { placeId: string; name: string }[];
  center: LatLng;
  /** 使い回す前回の結果（同じキーワードは検索しない。キーワードを足したときの追加費用を抑える） */
  reuse?: MeoRankResult | null;
  /** 前回の順位を previous に入れるための、前回の結果 */
  previous?: MeoRankResult | null;
  search: (query: string, center: LatLng, radiusM: number, limit: number) => Promise<RankedPlace[]>;
  now?: () => Date;
  radiusM?: number;
  limit?: number;
}

function byKeyword(result: MeoRankResult | null | undefined): Map<string, RankKeywordResult> {
  return new Map((result?.keywords ?? []).map((k) => [k.keyword, k]));
}

/** キーワードごとに検索して順位をまとめる。1 本の失敗は error に入れて続ける */
export async function measureRanks(params: MeasureRanksParams): Promise<MeoRankResult> {
  const now = params.now ?? (() => new Date());
  const radiusM = params.radiusM ?? RANK_RADIUS_M;
  const limit = params.limit ?? RANK_LIMIT;
  const reuse = byKeyword(params.reuse);
  const previous = byKeyword(params.previous);
  const keywords = [...new Set(params.keywords.map((k) => k.trim()).filter((k) => k.length > 0))];
  const out: RankKeywordResult[] = [];

  for (const keyword of keywords) {
    const prev = previous.get(keyword);
    const reused = reuse.get(keyword);
    if (reused && reused.error === null) {
      out.push({ ...reused, previous: prev?.rank ?? reused.previous });
      continue;
    }
    let results: RankedPlace[];
    try {
      results = await params.search(keyword, params.center, radiusM, limit);
    } catch (err) {
      out.push({
        keyword,
        rank: null,
        previous: prev?.rank,
        top: [],
        competitors: params.competitors.map((c) => ({ placeId: c.placeId, name: c.name, rank: null })),
        total: 0,
        measuredAt: now().toISOString(),
        error: err instanceof Error ? err.message : "検索に失敗しました",
      });
      continue;
    }
    out.push({
      keyword,
      rank: rankOf(results, params.ownPlaceId),
      previous: prev?.rank,
      top: results.slice(0, RANK_TOP),
      competitors: params.competitors.map((c) => ({ placeId: c.placeId, name: c.name, rank: rankOf(results, c.placeId) })),
      total: results.length,
      measuredAt: now().toISOString(),
      error: null,
    });
  }
  return { center: params.center, radiusM, limit, keywords: out };
}

/** 順位の表示（"3 位" / "圏外" / "—"） */
export function formatRank(rank: number | null | undefined, limit = RANK_LIMIT): string {
  if (rank === undefined) return "—";
  return rank === null ? `圏外（${limit} 位より下）` : `${rank} 位`;
}
