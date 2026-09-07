/**
 * 期間の指定（B6・E8 で共有）。純関数で、UTC 基準で計算する。
 *
 * GA4 は当日のデータが確定していないので、プリセットの終端は「昨日」にする。
 * 前期間は「同じ日数だけ直前」（前年同期ではない）。
 */

export interface DateRange {
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  return isoOf(new Date(toUtc(iso).getTime() + days * 86_400_000));
}

/** 期間の日数（両端を含む）。逆順・不正な日付は 0 */
export function daysInRange(range: DateRange): number {
  if (!isIsoDate(range.startDate) || !isIsoDate(range.endDate)) return 0;
  const diff = (toUtc(range.endDate).getTime() - toUtc(range.startDate).getTime()) / 86_400_000;
  return diff < 0 ? 0 : Math.round(diff) + 1;
}

/** 昨日を終端にした直近 N 日 */
export function rangeForDays(days: number, today = new Date()): DateRange {
  const n = Math.max(1, Math.floor(days));
  const endDate = isoOf(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - 86_400_000));
  return { startDate: addDaysIso(endDate, -(n - 1)), endDate };
}

/** 同じ日数だけ直前の期間。日数が取れないときは同じ範囲を返す */
export function previousRange(range: DateRange): DateRange {
  const days = daysInRange(range);
  if (days <= 0) return range;
  const endDate = addDaysIso(range.startDate, -1);
  return { startDate: addDaysIso(endDate, -(days - 1)), endDate };
}

export interface PeriodPreset {
  days: number;
  label: string;
}

/** 期間ピッカーの選択肢 */
export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  { days: 7, label: "直近 7 日" },
  { days: 28, label: "直近 28 日" },
  { days: 90, label: "直近 90 日" },
  { days: 180, label: "直近 180 日" },
  { days: 365, label: "直近 365 日" },
] as const;

/** 期間の表示（「2026-08-11 〜 2026-09-07（28 日間）」） */
export function formatRange(range: DateRange): string {
  const days = daysInRange(range);
  return `${range.startDate} 〜 ${range.endDate}${days > 0 ? `（${days} 日間）` : ""}`;
}
