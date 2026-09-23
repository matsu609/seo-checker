/**
 * Search Console 用の期間。純関数で、UTC 基準で計算する。
 *
 * GSC はデータの確定に 2〜3 日かかる。終了日を「昨日」にすると
 * 直近 2 日がほぼ 0 件で入り、折れ線が右端で急落しているように見えてしまう。
 * そのため終了日を 3 日前にずらす。前期間は「同じ日数だけ直前」（前年同期ではない）。
 */

export interface DateRange {
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

/** 終了日を今日から何日前にするか */
export const SEARCH_CONSOLE_LAG_DAYS = 3;

/** 期間の選択肢（日数） */
export const SEARCH_CONSOLE_PERIODS = [7, 28, 90, 180, 365] as const;

const DAY_MS = 86_400_000;

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addDaysIso(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 期間の日数（両端を含む）。逆順・不正な日付は 0 */
export function daysInRange(range: DateRange): number {
  if (!isIsoDate(range.startDate) || !isIsoDate(range.endDate)) return 0;
  const diff = (Date.parse(`${range.endDate}T00:00:00.000Z`) - Date.parse(`${range.startDate}T00:00:00.000Z`)) / DAY_MS;
  return diff < 0 ? 0 : Math.round(diff) + 1;
}

/** 3 日前を終端にした直近 N 日 */
export function searchConsoleRange(days: number, today = new Date()): DateRange {
  const n = Math.max(1, Math.floor(days));
  const todayIso = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())).toISOString().slice(0, 10);
  const endDate = addDaysIso(todayIso, -SEARCH_CONSOLE_LAG_DAYS);
  return { startDate: addDaysIso(endDate, -(n - 1)), endDate };
}

/** 同じ日数だけ直前の期間。日数が取れないときは同じ範囲を返す */
export function previousRange(range: DateRange): DateRange {
  const days = daysInRange(range);
  if (days <= 0) return range;
  const endDate = addDaysIso(range.startDate, -1);
  return { startDate: addDaysIso(endDate, -(days - 1)), endDate };
}
