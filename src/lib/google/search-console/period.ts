/**
 * Search Console 用の期間。
 *
 * GSC はデータの確定に 2〜3 日かかる。GA4 と同じ「終了日 = 昨日」にすると
 * 直近 2 日がほぼ 0 件で入り、折れ線が右端で急落しているように見えてしまう。
 * そのため終了日を 3 日前にずらす。
 */
import { addDaysIso, rangeForDays, type DateRange } from "@/lib/ga4/period";

/** 終了日を今日から何日前にするか */
export const SEARCH_CONSOLE_LAG_DAYS = 3;

export function searchConsoleRange(days: number, today = new Date()): DateRange {
  const n = Math.max(1, Math.floor(days));
  // rangeForDays の終了日は「昨日」なので、そこからさらに 2 日戻して 3 日前にする
  const endDate = addDaysIso(rangeForDays(n, today).endDate, -(SEARCH_CONSOLE_LAG_DAYS - 1));
  return { startDate: addDaysIso(endDate, -(n - 1)), endDate };
}
