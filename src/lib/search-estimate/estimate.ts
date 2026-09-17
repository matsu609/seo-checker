/**
 * 推定の計算（純関数だけ）。ネットワークには出ない。
 *
 *   推定表示回数 ≒ 月間検索数
 *   推定クリック数 ≒ 月間検索数 × CTR(順位)
 *
 * 月間検索数が分からないキーワードは**分子にも分母にも入れない**。
 * 0 として扱うと数字が黙って小さくなり、実態より悪く見えるため
 * （findability.ts と同じ方針）。
 */
import { ctrForRank } from "./findability";
import type { EstimatedRow, RankedKeyword, SearchEstimate } from "./types";

/** 1 キーワード分の推定 */
export function estimateRow(keyword: RankedKeyword): EstimatedRow {
  const ctr = ctrForRank(keyword.rank);
  const volume = typeof keyword.monthlyVolume === "number" && Number.isFinite(keyword.monthlyVolume) && keyword.monthlyVolume >= 0 ? keyword.monthlyVolume : null;
  return {
    ...keyword,
    monthlyVolume: volume,
    ctr,
    impressions: volume,
    clicks: volume === null ? null : volume * ctr,
  };
}

function inRange(rank: number | null, max: number): boolean {
  return rank !== null && Number.isFinite(rank) && rank >= 1 && rank <= max;
}

/** 行の集合 → 画面に出すまとめ */
export function summarize(domain: string, keywords: readonly RankedKeyword[], fetchedAt: string): SearchEstimate {
  const rows = keywords.map(estimateRow);

  let impressions = 0;
  let clicks = 0;
  let counted = 0;
  let rankWeight = 0;
  let rankWeighted = 0;

  for (const row of rows) {
    if (row.impressions === null || row.clicks === null) continue;
    counted += 1;
    impressions += row.impressions;
    clicks += row.clicks;
    // 平均順位は「見られている量」で重み付けする（検索数 1 のキーワードと 10,000 を同じ重みにしない）
    if (row.rank !== null && row.impressions > 0) {
      rankWeight += row.impressions;
      rankWeighted += row.rank * row.impressions;
    }
  }

  return {
    domain,
    fetchedAt,
    keywords: rows.length,
    counted,
    impressions: Math.round(impressions),
    clicks: Math.round(clicks),
    ctr: impressions > 0 ? clicks / impressions : null,
    averageRank: rankWeight > 0 ? rankWeighted / rankWeight : null,
    top3: rows.filter((r) => inRange(r.rank, 3)).length,
    top10: rows.filter((r) => inRange(r.rank, 10)).length,
    top50: rows.filter((r) => inRange(r.rank, 50)).length,
    // 推定クリックの多い順。不明（null）は最後に回す
    rows: rows.slice().sort((a, b) => (b.clicks ?? -1) - (a.clicks ?? -1)),
  };
}
