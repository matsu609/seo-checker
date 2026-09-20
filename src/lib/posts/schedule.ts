/**
 * 投稿の予定と検査（純粋関数。テストで固定する）。
 */
import { addDays, jstDate, jstParts, nextWeekdayAtJst } from "@/lib/time/jst";
import { POST_SUMMARY_MAX, POST_TITLE_MAX, type GbpPost, type PostInput } from "./types";

/** 既定の投稿曜日・時刻（月曜 10:00 JST。週 1 回の投稿が MEO の理想状態） */
export const DEFAULT_POST_WEEKDAY = 1;
export const DEFAULT_POST_HOUR = 10;

/** 次の N 回分の予定（毎週同じ曜日・時刻。ISO） */
export function defaultScheduleDates(now: Date, count: number, weekday = DEFAULT_POST_WEEKDAY, hour = DEFAULT_POST_HOUR): string[] {
  const first = nextWeekdayAtJst(now, weekday, hour);
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(first, i * 7).toISOString());
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 予約・投稿の前の検査。空配列なら OK */
export function validatePost(p: Pick<PostInput, "topicType" | "title" | "summary" | "ctaType" | "ctaUrl" | "eventStart" | "eventEnd">): string[] {
  const errors: string[] = [];
  const summary = p.summary.trim();
  if (!summary) errors.push("本文を入力してください");
  if (summary.length > POST_SUMMARY_MAX) errors.push(`本文は ${POST_SUMMARY_MAX} 文字までです`);
  if (p.title.length > POST_TITLE_MAX) errors.push(`題名は ${POST_TITLE_MAX} 文字までです`);
  if (p.topicType !== "STANDARD") {
    if (!p.title.trim()) errors.push("イベント・クーポンには題名が要ります");
    if (!p.eventStart || !DATE.test(p.eventStart)) errors.push("開始日（YYYY-MM-DD）を入力してください");
    if (!p.eventEnd || !DATE.test(p.eventEnd)) errors.push("終了日（YYYY-MM-DD）を入力してください");
    if (p.eventStart && p.eventEnd && p.eventStart > p.eventEnd) errors.push("終了日は開始日より後にしてください");
  }
  if (p.ctaType !== "NONE" && p.ctaType !== "CALL") {
    if (!/^https?:\/\/\S+$/.test(p.ctaUrl.trim())) errors.push("ボタンのリンク先（https://…）を入力してください");
  }
  return errors;
}

/** 予定時刻を過ぎた予約済みの投稿か */
export function isDue(p: Pick<GbpPost, "status" | "scheduledAt">, now: Date): boolean {
  return p.status === "scheduled" && p.scheduledAt !== null && new Date(p.scheduledAt).getTime() <= now.getTime();
}

/** 画面の datetime-local（JST の壁時計）↔ ISO */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = jstParts(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export function fromLocalInput(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  return jstDate(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5])).toISOString();
}

/** 投稿の順番（予定が近い順。予定の無い下書きは後ろ、投稿済みはさらに後ろ） */
export function sortPosts(posts: readonly GbpPost[]): GbpPost[] {
  const weight = (p: GbpPost) => (p.status === "scheduled" ? 0 : p.status === "draft" || p.status === "failed" ? 1 : 2);
  return [...posts].sort((a, b) => weight(a) - weight(b) || (a.scheduledAt ?? "9").localeCompare(b.scheduledAt ?? "9") || b.createdAt.localeCompare(a.createdAt));
}
