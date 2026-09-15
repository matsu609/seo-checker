/**
 * ルールを書くための小さな道具（純関数）。
 *
 * ルール本体は「宣言」に徹し、計算はここと metrics.ts に寄せる。
 */
import { changeOf, ctrOf, directionOf, formatChange, formatNumber, formatPercent, median, type Change, type Direction } from "../metrics";
import type { DiagnosisContext, DiagnosisRule, GscDataset, KeyedMetrics, SearchMetrics } from "../types";

/** 型を効かせるだけの宣言ヘルパー */
export function rule(r: DiagnosisRule): DiagnosisRule {
  return r;
}

/** GSC が無いルールは全部黙る */
export function gsc(ctx: DiagnosisContext): GscDataset | null {
  return ctx.gsc;
}

/** 全体の増減（クリック・表示・CTR・順位） */
export interface Totals {
  clicks: Change;
  impressions: Change;
  ctr: Change;
  positionDiff: number;
  clicksDir: Direction;
  impressionsDir: Direction;
  ctrDir: Direction;
}

export function totalsChange(ctx: DiagnosisContext, g: GscDataset): Totals {
  const t = ctx.thresholds;
  const clicks = changeOf(g.totals.current.clicks, g.totals.previous.clicks);
  const impressions = changeOf(g.totals.current.impressions, g.totals.previous.impressions);
  const ctr = changeOf(g.totals.current.ctr, g.totals.previous.ctr);
  return {
    clicks,
    impressions,
    ctr,
    positionDiff: g.totals.current.position - g.totals.previous.position,
    clicksDir: directionOf(clicks, t),
    impressionsDir: directionOf(impressions, t),
    ctrDir: directionOf(ctr, t),
  };
}

/** 前期の行を key で引けるようにする */
export function indexOf(rows: readonly KeyedMetrics[]): Map<string, KeyedMetrics> {
  const map = new Map<string, KeyedMetrics>();
  for (const r of rows) map.set(r.key, r);
  return map;
}

/** 十分な母数があるか（表示回数） */
export function hasVolume(ctx: DiagnosisContext, g: GscDataset): boolean {
  return g.totals.current.impressions >= ctx.thresholds.minimumTotalImpressions;
}

/** 分析期間が揃っていて、比較してよい状態か */
export function comparable(ctx: DiagnosisContext): boolean {
  const d = ctx.derived;
  return d.daysCurrent >= ctx.thresholds.minimumAnalysisDays && d.daysCurrent === d.daysPrevious;
}

/** 上位 n 件を "A（1,234 クリック）" の形で並べる */
export function listTop(rows: readonly KeyedMetrics[], n: number, format: (r: KeyedMetrics) => string): string[] {
  return rows.slice(0, n).map(format);
}

/** 行の合計 */
export function sumOf(rows: readonly KeyedMetrics[]): SearchMetrics {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    weighted += r.position * r.impressions;
  }
  return { clicks, impressions, ctr: ctrOf(clicks, impressions), position: impressions > 0 ? weighted / impressions : 0 };
}

/** 日別の急増・急減を探す（中央値の n 倍 / 1/n 倍） */
export function outlierDays(rows: readonly KeyedMetrics[], multiplier: number, field: "clicks" | "impressions" = "clicks"): { spikes: KeyedMetrics[]; drops: KeyedMetrics[]; median: number } {
  const values = rows.map((r) => r[field]);
  const mid = median(values);
  if (mid <= 0) return { spikes: [], drops: [], median: mid };
  return {
    spikes: rows.filter((r) => r[field] >= mid * multiplier),
    // 落ち込みは「中央値の 1/multiplier 未満」。0 の日も含む
    drops: rows.filter((r) => r[field] <= mid / multiplier),
    median: mid,
  };
}

/** 曜日ごとの平均（T12 週末だけ減少） */
export function byWeekday(rows: readonly KeyedMetrics[], field: "clicks" | "impressions" = "clicks"): number[] {
  const sums = new Array(7).fill(0) as number[];
  const counts = new Array(7).fill(0) as number[];
  for (const r of rows) {
    const t = Date.parse(`${r.key}T00:00:00Z`);
    if (!Number.isFinite(t)) continue;
    const day = new Date(t).getUTCDay();
    sums[day] += r[field];
    counts[day] += 1;
  }
  return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
}

export { formatChange, formatNumber, formatPercent, changeOf, ctrOf, directionOf, median };
