/**
 * 画面に出す日時の書き方（数字だけの短い形）。
 *
 * 「2026年9月6日 14:05」の形は lib/report/format.ts の formatDateTime を使う。
 * 2026-09-23 まで、同じ実装が NAP チェック（NapTool）とご意見の履歴（FeedbackHistoryCard）にあった。
 */

const NUMERIC_DATE_TIME: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" };

/**
 * ISO 日時 → 「2026/09/06 14:05」（ブラウザのタイムゾーン。月・日・時・分は 2 桁）。
 * 読めない値のときは `invalid`（省略時は入力をそのまま返す）。
 */
export function formatNumericDateTime(iso: string, invalid?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return invalid ?? iso;
  return d.toLocaleString("ja-JP", NUMERIC_DATE_TIME);
}
