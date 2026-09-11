/**
 * 回答の集計（純粋関数。クライアントでも読める）。
 *
 * Google マップへの投稿はコールバックが取れないので、実投稿数は分からない。
 * 出せるのは「投稿ボタンの押下数・押下率」までで、画面にもそう明記する。
 */
import type { ReviewChannel } from "./forms";
import type { ReviewResponse } from "./responses";

export interface ReviewMetrics {
  total: number;
  /** 評価の平均（評価の回答が無ければ null） */
  averageRating: number | null;
  /** 1〜5 の件数 */
  distribution: [number, number, number, number, number];
  low: number;
  lowOpen: number;
  reviewClicks: number;
  /** 押下率（%）。回答 0 なら null */
  reviewClickRate: number | null;
  directMessages: number;
  byChannel: ChannelStat[];
  byWeek: WeekStat[];
}

export interface ChannelStat {
  channelId: string | null;
  label: string;
  total: number;
  averageRating: number | null;
  low: number;
  reviewClicks: number;
}

export interface WeekStat {
  /** 週の開始日（月曜、YYYY-MM-DD） */
  weekStart: string;
  total: number;
  averageRating: number | null;
  low: number;
  reviewClicks: number;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

/** 日付 → その週の月曜（YYYY-MM-DD、JST） */
export function weekStartOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // JST に寄せてから曜日を見る
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const day = (jst.getUTCDay() + 6) % 7; // 月曜 = 0
  jst.setUTCDate(jst.getUTCDate() - day);
  return jst.toISOString().slice(0, 10);
}

export function computeMetrics(responses: readonly ReviewResponse[], channels: readonly ReviewChannel[], weeks = 8): ReviewMetrics {
  const ratings = responses.map((r) => r.rating).filter((r): r is number => r !== null);
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of ratings) if (r >= 1 && r <= 5) distribution[r - 1] += 1;
  const reviewClicks = responses.filter((r) => r.clickedReviewAt !== null).length;

  const labelOf = new Map(channels.map((c) => [c.id, c.label]));
  const groups = new Map<string | null, ReviewResponse[]>();
  for (const r of responses) {
    const key = r.channelId && labelOf.has(r.channelId) ? r.channelId : null;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }
  const byChannel: ChannelStat[] = [];
  for (const c of channels) {
    const list = groups.get(c.id) ?? [];
    byChannel.push(channelStat(c.id, c.label, list));
  }
  const unknown = groups.get(null) ?? [];
  if (unknown.length > 0) byChannel.push(channelStat(null, "QR なし（直リンク）", unknown));

  const weekMap = new Map<string, ReviewResponse[]>();
  for (const r of responses) {
    const w = weekStartOf(r.createdAt);
    if (!w) continue;
    const list = weekMap.get(w) ?? [];
    list.push(r);
    weekMap.set(w, list);
  }
  const byWeek: WeekStat[] = Array.from(weekMap.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, weeks)
    .map(([weekStart, list]) => ({
      weekStart,
      total: list.length,
      averageRating: avg(list.map((r) => r.rating).filter((r): r is number => r !== null)),
      low: list.filter((r) => r.isLow).length,
      reviewClicks: list.filter((r) => r.clickedReviewAt !== null).length,
    }));

  return {
    total: responses.length,
    averageRating: avg(ratings),
    distribution,
    low: responses.filter((r) => r.isLow).length,
    lowOpen: responses.filter((r) => r.isLow && r.status === "open").length,
    reviewClicks,
    reviewClickRate: responses.length === 0 ? null : Math.round((reviewClicks / responses.length) * 1000) / 10,
    directMessages: responses.filter((r) => r.directMessage !== null).length,
    byChannel,
    byWeek,
  };
}

function channelStat(channelId: string | null, label: string, list: ReviewResponse[]): ChannelStat {
  return {
    channelId,
    label,
    total: list.length,
    averageRating: avg(list.map((r) => r.rating).filter((r): r is number => r !== null)),
    low: list.filter((r) => r.isLow).length,
    reviewClicks: list.filter((r) => r.clickedReviewAt !== null).length,
  };
}
