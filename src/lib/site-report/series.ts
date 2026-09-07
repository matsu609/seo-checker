/**
 * 登録キーワードの「平均順位」と「ファインダビリティスコア」の時系列（純関数）。
 *
 * データ源は順位計測（B1）が localStorage に貯めているスナップショット
 * （src/lib/rank/store.ts）。GA4 とは独立しているので、GA4 が未設定でも
 * この半分だけは描ける。
 *
 * 圏外（rank = null）は「設定した順位」として平均に含める（既定 101 位）。
 * 未取得（その日にスナップショットが無い）は平均にもスコアにも含めない
 * ＝ グラフでは線を切る（前日値を引き継がない）。
 */
import { bucketOf } from "@/lib/ai-traffic/aggregate";
import type { Granularity } from "@/lib/ai-traffic/types";
import type { RankKeyword, RankSnapshot } from "@/lib/rank/store";
import { findabilityScore } from "./findability";

/** 圏外の扱い。数値なら「その順位として平均に含める」、null なら「平均から除外」 */
export type OutOfRangeMode = number | null;

/** 圏外の既定値（101 位として平均する）。画面はこの数字を必ず明示する */
export const DEFAULT_OUT_OF_RANGE_RANK = 101;

/** 圏外の扱いの選択肢 */
export const OUT_OF_RANGE_OPTIONS: ReadonlyArray<{ value: OutOfRangeMode; label: string }> = [
  { value: 101, label: "圏外を 101 位として平均する" },
  { value: 51, label: "圏外を 51 位として平均する" },
  { value: null, label: "圏外を平均から除外する" },
] as const;

export interface AverageRankResult {
  /** 平均順位。1 件も使えなければ null */
  value: number | null;
  /** 平均に使った件数 */
  measured: number;
  /** そのうち圏外だった件数 */
  outOfRange: number;
  /** 未取得で平均に含めなかった件数 */
  missing: number;
}

/**
 * 平均順位。undefined は未取得として捨て、null（圏外）は outOfRangeValue として数える。
 * outOfRangeValue が null のときは圏外も平均から外す（件数だけ返す）。
 */
export function averageRank(
  ranks: ReadonlyArray<number | null | undefined>,
  outOfRangeValue: OutOfRangeMode = DEFAULT_OUT_OF_RANGE_RANK,
): AverageRankResult {
  let sum = 0;
  let used = 0;
  let outOfRange = 0;
  let missing = 0;
  for (const rank of ranks) {
    if (rank === undefined) {
      missing += 1;
      continue;
    }
    if (rank === null) {
      outOfRange += 1;
      if (outOfRangeValue !== null) {
        sum += outOfRangeValue;
        used += 1;
      }
      continue;
    }
    if (!Number.isFinite(rank)) {
      missing += 1;
      continue;
    }
    sum += rank;
    used += 1;
  }
  return {
    value: used > 0 ? sum / used : null,
    measured: used,
    outOfRange,
    missing,
  };
}

export interface RankDailyPoint {
  /** YYYY-MM-DD */
  date: string;
  /** 登録キーワードの平均順位（圏外の扱いは outOfRangeValue に従う） */
  averageRank: number | null;
  /** ファインダビリティスコア（0〜100）。月間検索数が 1 件も無ければ null */
  findability: number | null;
  /** その日に計測できたキーワード数 */
  measured: number;
  /** そのうち圏外だった件数 */
  outOfRange: number;
  /** 月間検索数が未登録でスコアから除外した件数 */
  excludedVolume: number;
}

export interface RankSeriesOptions {
  /** この期間内の日付だけを使う（YYYY-MM-DD） */
  startDate?: string;
  endDate?: string;
  outOfRangeValue?: OutOfRangeMode;
}

/**
 * 日別の平均順位・ファインダビリティスコア（古い順）。
 * スナップショットが 1 件も無い日は点を作らない（グラフの線が切れる）。
 */
export function rankDailySeries(
  keywords: readonly RankKeyword[],
  snapshots: readonly RankSnapshot[],
  options: RankSeriesOptions = {},
): RankDailyPoint[] {
  const { startDate, endDate, outOfRangeValue = DEFAULT_OUT_OF_RANGE_RANK } = options;
  const volumeById = new Map<string, number | null>();
  for (const k of keywords) volumeById.set(k.id, k.monthlyVolume ?? null);

  // 日付 → キーワード ID → 順位（同じ日に複数あれば後勝ち）
  const byDate = new Map<string, Map<string, number | null>>();
  for (const s of snapshots) {
    if (!volumeById.has(s.keywordId)) continue;
    if (startDate && s.takenOn < startDate) continue;
    if (endDate && s.takenOn > endDate) continue;
    const day = byDate.get(s.takenOn) ?? new Map<string, number | null>();
    day.set(s.keywordId, s.rank);
    byDate.set(s.takenOn, day);
  }

  return Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, day]) => {
      const ranks = Array.from(day.values());
      const avg = averageRank(ranks, outOfRangeValue);
      const score = findabilityScore(
        Array.from(day.entries()).map(([id, rank]) => ({ rank, volume: volumeById.get(id) ?? null })),
      );
      return {
        date,
        averageRank: avg.value,
        findability: score.score,
        measured: day.size,
        outOfRange: avg.outOfRange,
        excludedVolume: score.excluded,
      };
    });
}

/**
 * 日別の点を、流入グラフのバケット（日 / 週 / 月）に合わせて平均する。
 * 値の無いバケットは null（線を切る）。
 */
export function averageByBucket(
  points: readonly RankDailyPoint[],
  keys: readonly string[],
  granularity: Granularity,
  pick: (point: RankDailyPoint) => number | null,
): Array<number | null> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const point of points) {
    const value = pick(point);
    if (value === null || !Number.isFinite(value)) continue;
    const bucket = bucketOf(point.date, granularity);
    if (!bucket) continue;
    const entry = sums.get(bucket.key) ?? { sum: 0, count: 0 };
    entry.sum += value;
    entry.count += 1;
    sums.set(bucket.key, entry);
  }
  return keys.map((key) => {
    const entry = sums.get(key);
    return entry && entry.count > 0 ? entry.sum / entry.count : null;
  });
}

/** 平均順位の表示（小数 1 桁）。null は「—」 */
export function formatAverageRank(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(1);
}
