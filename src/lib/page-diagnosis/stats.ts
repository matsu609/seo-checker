/**
 * Top10 の平均・中央値と自社ページとの差分（純関数・テスト対象）。
 *
 * 件数 0 のときに 0 を返すと「平均 0 文字の上位ページ」という嘘になるため、
 * 値が決められないところはすべて null にする（画面は「—」と出す）。
 */
import type { DiagnosisStats, MetricStats, PageMeasurement } from "./types";

function finite(values: readonly number[]): number[] {
  return values.filter((v) => typeof v === "number" && Number.isFinite(v));
}

/** 平均。空配列は null */
export function average(values: readonly number[]): number | null {
  const list = finite(values);
  if (list.length === 0) return null;
  const sum = list.reduce((a, b) => a + b, 0);
  return sum / list.length;
}

/** 中央値（偶数件は中央 2 件の平均）。空配列は null */
export function median(values: readonly number[]): number | null {
  const list = finite(values).slice().sort((a, b) => a - b);
  if (list.length === 0) return null;
  const mid = Math.floor(list.length / 2);
  return list.length % 2 === 1 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
}

/** 小数第 1 位まで（表示のぶれを防ぐ） */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 1 指標の統計。self が無ければ gap / ratio は null */
export function metricStats(values: readonly number[], self: number | null): MetricStats {
  const list = finite(values);
  const avg = average(list);
  const med = median(list);
  const selfValue = typeof self === "number" && Number.isFinite(self) ? self : null;
  return {
    count: list.length,
    average: avg === null ? null : round1(avg),
    median: med === null ? null : round1(med),
    min: list.length === 0 ? null : Math.min(...list),
    max: list.length === 0 ? null : Math.max(...list),
    self: selfValue,
    gap: avg === null || selfValue === null ? null : round1(selfValue - avg),
    ratio: avg === null || avg === 0 || selfValue === null ? null : round1(selfValue / avg),
  };
}

/** 測定値の集合 → 指標ごとの統計 */
export function buildStats(
  competitors: ReadonlyArray<PageMeasurement>,
  self: PageMeasurement | null,
): DiagnosisStats {
  const pick = (fn: (m: PageMeasurement) => number): number[] => competitors.map(fn);
  const selfOf = (fn: (m: PageMeasurement) => number): number | null => (self ? fn(self) : null);
  const headingCount = (m: PageMeasurement) => m.headings.length;
  return {
    charCount: metricStats(pick((m) => m.charCount), selfOf((m) => m.charCount)),
    images: metricStats(pick((m) => m.images), selfOf((m) => m.images)),
    internalLinks: metricStats(pick((m) => m.internalLinks), selfOf((m) => m.internalLinks)),
    externalLinks: metricStats(pick((m) => m.externalLinks), selfOf((m) => m.externalLinks)),
    fetchMs: metricStats(pick((m) => m.fetchMs), selfOf((m) => m.fetchMs)),
    headings: metricStats(pick(headingCount), selfOf(headingCount)),
  };
}

export interface StatMetricMeta {
  key: keyof DiagnosisStats;
  label: string;
  unit: string;
  /** 多いほど良い指標か（表示の色の向き）。表示時間は少ない方が良い */
  moreIsBetter: boolean;
}

/** 画面・CSV で使う指標の並び（ラベルは 1 箇所にまとめる） */
export const STAT_METRICS: readonly StatMetricMeta[] = [
  { key: "charCount", label: "文字数", unit: "文字", moreIsBetter: true },
  { key: "images", label: "画像数", unit: "枚", moreIsBetter: true },
  { key: "headings", label: "見出し数（h1〜h3）", unit: "個", moreIsBetter: true },
  { key: "internalLinks", label: "内部リンク数", unit: "本", moreIsBetter: true },
  { key: "externalLinks", label: "外部リンク数", unit: "本", moreIsBetter: true },
  { key: "fetchMs", label: "取得時間", unit: "ms", moreIsBetter: false },
];

/** 数値の表示（null は「—」） */
export function formatStat(value: number | null, unit = ""): string {
  if (value === null) return "—";
  const num = Number.isInteger(value) ? value.toLocaleString("ja-JP") : value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
  return unit ? `${num} ${unit}` : num;
}
