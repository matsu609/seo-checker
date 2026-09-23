/**
 * 回答の一覧の期間指定（?from=YYYY-MM-DD&to=YYYY-MM-DD）の読み取り。純粋関数。
 */
import { addDays, jstDate, jstDateKey } from "@/lib/time/jst";

/**
 * 日本時間の日付（YYYY-MM-DD）→ その日の 0:00 JST（ISO）。`days` 日ずらせる（to は翌日 0:00 未満で絞るため 1）。
 * 形が違う・存在しない日付（2026-13-01、2026-02-30）は null。
 *
 * 2026-09-23: 以前は `new Date("…T00:00:00+09:00").toISOString()` を検証の外で呼んでいたため、
 * 13 月は RangeError で 500 になり、2 月 30 日は黙って 3 月 2 日として扱われていた。
 */
export function jstDayStartIso(date: string, days = 0): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const start = jstDate(Number(m[1]), Number(m[2]), Number(m[3]));
  // 存在しない日付は Date が次の月へ繰り上げるので、日付に戻して同じか確かめる
  if (Number.isNaN(start.getTime()) || jstDateKey(start) !== date) return null;
  return addDays(start, days).toISOString();
}
