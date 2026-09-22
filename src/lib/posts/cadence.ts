/**
 * 投稿の頻度（週ごとの本数）の集計。純粋関数・クライアントでも読める。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください」。
 * 投稿画面は一覧しか無く、**MEO の理想である「週 1 回を続けられているか」**が分からなかった。
 *
 * 数えるのは日本時間の週（月曜始まり）で、
 *   - 投稿済み（published）… `publishedAt`。実績なので実線で描く
 *   - 予約済み（scheduled）… `scheduledAt`。まだ起きていないので破線で描く
 * 下書き・取り消し・失敗は数えない（Google マップに出ていないため）。
 */
import { jstWeekStart } from "@/lib/time/jst";
import type { GbpPost } from "./types";

export interface CadenceWeek {
  /** 週の始まり（月曜、YYYY-MM-DD） */
  weekStart: string;
  /** その週に投稿できた本数 */
  published: number;
  /** その週に予約してある本数 */
  scheduled: number;
}

/** MEO の理想（週 1 回）。グラフの目安線に使う */
export const IDEAL_PER_WEEK = 1;

/** 過去に何週さかのぼるか / 先に何週見るか（既定） */
export const WEEKS_BACK = 8;
export const WEEKS_AHEAD = 4;

/** 月曜（YYYY-MM-DD）に週数を足す */
function shiftWeek(weekStart: string, weeks: number): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + weeks * 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
}

/**
 * 投稿の一覧 → 週ごとの本数（古い順）。
 * 投稿が 1 本も無い週も 0 として並べる（歯抜けにすると「続いている」かが読めない）。
 */
export function weeklyCadence(
  posts: readonly GbpPost[],
  { weeksBack = WEEKS_BACK, weeksAhead = WEEKS_AHEAD, now = new Date() }: { weeksBack?: number; weeksAhead?: number; now?: Date } = {},
): CadenceWeek[] {
  const thisWeek = jstWeekStart(now);
  const weeks: CadenceWeek[] = [];
  for (let i = -weeksBack; i <= weeksAhead; i += 1) weeks.push({ weekStart: shiftWeek(thisWeek, i), published: 0, scheduled: 0 });
  const index = new Map(weeks.map((w, i) => [w.weekStart, i]));

  for (const post of posts) {
    if (post.status === "published" && post.publishedAt) {
      const i = index.get(jstWeekStart(new Date(post.publishedAt)));
      if (i !== undefined) weeks[i]!.published += 1;
    } else if (post.status === "scheduled" && post.scheduledAt) {
      const i = index.get(jstWeekStart(new Date(post.scheduledAt)));
      if (i !== undefined) weeks[i]!.scheduled += 1;
    }
  }
  return weeks;
}

/** 週ごとの本数 → 「直近 N 週のうち、投稿できた週の数」 */
export function weeksWithPost(weeks: readonly CadenceWeek[], now = new Date()): { covered: number; total: number } {
  const thisWeek = jstWeekStart(now);
  const past = weeks.filter((w) => w.weekStart <= thisWeek);
  return { covered: past.filter((w) => w.published >= IDEAL_PER_WEEK).length, total: past.length };
}
