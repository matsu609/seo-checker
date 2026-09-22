/**
 * 日本時間（JST）の日付の計算。純粋関数だけを置く（サーバー・ブラウザどちらでも読める）。
 *
 * Vercel のサーバーは UTC なので、`new Date().getDate()` のような「ローカル時刻」の
 * 計算は日本の日付と 9 時間ずれる（2026-09-18 の棚卸しで B-7 として確認）。
 * 曜日・月初・日付キーはすべてここを通す。
 */

export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface JstParts {
  year: number;
  /** 1〜12 */
  month: number;
  /** 1〜31 */
  day: number;
  /** 0 = 日曜 … 6 = 土曜 */
  weekday: number;
  hour: number;
  minute: number;
}

/** UTC の Date → 日本時間の各部分 */
export function jstParts(date: Date): JstParts {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 日本時間の日付キー（YYYY-MM-DD） */
export function jstDateKey(date: Date): string {
  const p = jstParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/**
 * その日が属する週の月曜（日本時間、YYYY-MM-DD）。
 * 週ごとの集計（投稿の頻度・アンケートの回答数）はすべてここを通す。
 */
export function jstWeekStart(date: Date): string {
  const p = jstParts(date);
  const back = (p.weekday + 6) % 7; // 月曜 = 0
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 日本時間の月キー（YYYY-MM） */
export function jstMonthKey(date: Date): string {
  const p = jstParts(date);
  return `${p.year}-${pad(p.month)}`;
}

/** 日本時間の壁時計の時刻 → UTC の Date */
export function jstDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - JST_OFFSET_MS);
}

/** 月キー（YYYY-MM）→ その月の日本時間の範囲（ISO）。end は翌月の 1 日 0:00（含まない） */
export function monthRangeJst(monthKey: string): { start: string; end: string } {
  const [y, m] = monthKey.split("-").map(Number);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) throw new Error(`月の形式が正しくありません: ${monthKey}`);
  return { start: jstDate(y, m, 1).toISOString(), end: jstDate(y, m + 1, 1).toISOString() };
}

/** 月キーの前月（"2026-01" → "2025-12"） */
export function previousMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 月キーの表示（"2026-09" → "2026 年 9 月"） */
export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

/** 月キーが正しい形か */
export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** 日数を足す（ミリ秒の加算。夏時間は無いので JST ではこれで足りる） */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** 2 つの日時の差（日。小数）。b が後なら正 */
export function daysBetween(a: Date | string, b: Date | string): number {
  const ta = typeof a === "string" ? new Date(a).getTime() : a.getTime();
  const tb = typeof b === "string" ? new Date(b).getTime() : b.getTime();
  return (tb - ta) / (24 * 60 * 60 * 1000);
}

/**
 * 次に「その曜日の hour:00 JST」になる日時（いまがちょうどその時刻なら翌週）。
 * maps/refresh.ts の nextRefreshAt と同じ決まり。
 */
export function nextWeekdayAtJst(now: Date, weekday: number, hour: number): Date {
  const p = jstParts(now);
  const today = jstDate(p.year, p.month, p.day, hour);
  let delta = (weekday - p.weekday + 7) % 7;
  if (delta === 0 && now.getTime() >= today.getTime()) delta = 7;
  return addDays(today, delta);
}

/** 次の「n 日 hour:00 JST」（いまがそれ以降なら翌月） */
export function nextMonthDayAtJst(now: Date, day: number, hour: number): Date {
  const p = jstParts(now);
  const thisMonth = jstDate(p.year, p.month, day, hour);
  if (now.getTime() < thisMonth.getTime()) return thisMonth;
  return jstDate(p.year, p.month + 1, day, hour);
}

export const WEEKDAY_LABELS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 「9/22（火）5:00」のような短い表示 */
export function formatJstShort(date: Date): string {
  const p = jstParts(date);
  return `${p.month}/${p.day}（${WEEKDAY_LABELS_JA[p.weekday]}）${p.hour}:${pad(p.minute)}`;
}
