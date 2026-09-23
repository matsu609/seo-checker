/**
 * 評価（★1〜★5）の分布を棒グラフ（components/charts の Histogram）の区分にする。
 *
 * 2026-09-23 まで、同じ実装が返信（replies/ReviewMixCard）と来店客アンケート（reviews/MetricsCard）の
 * 2 か所にあった。
 */
import { palette } from "./palette";

export interface RatingBand {
  label: string;
  count: number;
  color: string;
}

/** 1〜5 の件数 → 棒グラフの区分（星の多い順に左から。表の並びと同じ） */
export function ratingBands(distribution: readonly number[]): RatingBand[] {
  return [5, 4, 3, 2, 1].map((n) => ({
    label: `★${n}`,
    count: distribution[n - 1] ?? 0,
    // 低評価（1〜2）だけ色を変える。ここが対応すべき口コミ・回答
    color: n <= 2 ? palette.chart[3] : palette.chart[0],
  }));
}
