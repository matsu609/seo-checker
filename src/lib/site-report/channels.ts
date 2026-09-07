/**
 * チャネル別セッション（GA4 sessionDefaultChannelGroup）の集計（純関数）。
 *
 * 日付のバケット分け（日 / 週 / 月）は生成 AI 流入分析（B6）と同じ実装を使う
 * （`@/lib/ai-traffic/aggregate` の bucketOf）。同じ期間・同じ比較単位なら
 * 2 つの画面で x 軸が一致する。
 */
import { bucketOf, toIsoDate } from "@/lib/ai-traffic/aggregate";
import type { Granularity, TrafficMetric } from "@/lib/ai-traffic/types";
import { ORGANIC_SEARCH_CHANNEL } from "@/lib/ai-traffic/types";
import { palette } from "@/lib/ui/palette";
import type { ChannelDailyRow } from "./types";

export { ORGANIC_SEARCH_CHANNEL };

/** GA4 の既定チャネルグループ名 → 日本語（未知のチャネルはそのまま出す） */
export const CHANNEL_LABELS: Record<string, string> = {
  "Organic Search": "自然検索",
  Direct: "ノーリファラー",
  Referral: "参照サイト",
  "Organic Social": "SNS",
  "Organic Video": "動画サイト",
  Email: "メール",
  "Paid Search": "有料検索",
  "Paid Social": "有料SNS",
  Display: "ディスプレイ",
  Affiliates: "アフィリエイト",
  "Organic Shopping": "ショッピング",
  "Paid Shopping": "有料ショッピング",
  "Cross-network": "クロスネットワーク",
  Audio: "音声",
  "Mobile Push Notifications": "プッシュ通知",
  SMS: "SMS",
  Unassigned: "未割り当て",
};

export function channelLabel(channel: string): string {
  const name = channel.trim();
  if (!name) return "未割り当て";
  return CHANNEL_LABELS[name] ?? name;
}

/** 積み上げ棒に出すチャネル数の上限（palette.chart が 6 色） */
export const MAX_CHANNEL_SERIES = 6;
export const OTHER_CHANNEL_LABEL = "その他のチャネル";

export interface ChannelBucket {
  /** 並び替えに使うキー（day / week は YYYY-MM-DD、month は YYYY-MM） */
  key: string;
  /** x 軸に出すラベル */
  label: string;
  /** バケット全体の合計 */
  total: number;
  /** チャネル名（GA4 の原文） → 値 */
  byChannel: Record<string, number>;
}

export interface ChannelAggregateOptions {
  granularity: Granularity;
  metric: TrafficMetric;
}

function valueOf(row: ChannelDailyRow, metric: TrafficMetric): number {
  const raw = metric === "users" ? row.users : row.sessions;
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/** 日 × チャネルの素の行 → バケットごとのチャネル別集計（古い順） */
export function aggregateChannels(
  rows: readonly ChannelDailyRow[],
  options: ChannelAggregateOptions,
): ChannelBucket[] {
  const map = new Map<string, ChannelBucket>();
  for (const row of rows) {
    const bucket = bucketOf(toIsoDate(row.date), options.granularity);
    if (!bucket) continue;
    const value = valueOf(row, options.metric);
    const entry = map.get(bucket.key) ?? { ...bucket, total: 0, byChannel: {} };
    const channel = row.channel.trim() || "Unassigned";
    entry.total += value;
    entry.byChannel[channel] = (entry.byChannel[channel] ?? 0) + value;
    map.set(bucket.key, entry);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/** 期間合計の多い順にチャネル名（GA4 の原文）を並べる */
export function rankChannels(buckets: readonly ChannelBucket[]): Array<{ channel: string; value: number }> {
  const totals = new Map<string, number>();
  for (const bucket of buckets) {
    for (const [channel, value] of Object.entries(bucket.byChannel)) {
      totals.set(channel, (totals.get(channel) ?? 0) + value);
    }
  }
  return Array.from(totals.entries())
    .map(([channel, value]) => ({ channel, value }))
    .sort((a, b) => b.value - a.value || a.channel.localeCompare(b.channel));
}

/**
 * 積み上げに出すチャネル。上限を超えた分は「その他のチャネル」にまとめる
 * （色を使い回して別のチャネルに見えるのを避けるため）。
 */
export function topChannels(buckets: readonly ChannelBucket[], max = MAX_CHANNEL_SERIES): string[] {
  const ranked = rankChannels(buckets).map((c) => c.channel);
  if (ranked.length <= max) return ranked;
  return [...ranked.slice(0, max), OTHER_CHANNEL_LABEL];
}

/** バケット × チャネル → 値（topChannels と組で使う。「その他のチャネル」は残り全部） */
export function channelValues(bucket: ChannelBucket, channels: readonly string[]): number[] {
  return channels.map((channel) => {
    if (channel !== OTHER_CHANNEL_LABEL) return bucket.byChannel[channel] ?? 0;
    let rest = 0;
    for (const [name, value] of Object.entries(bucket.byChannel)) {
      if (!channels.includes(name)) rest += value;
    }
    return rest;
  });
}

/** チャネルの色（palette の hex）。自然検索だけは accent で固定し、残りは順に割り当てる */
export function channelColor(channel: string, index: number): string {
  if (channel === ORGANIC_SEARCH_CHANNEL) return palette.accent;
  if (channel === OTHER_CHANNEL_LABEL) return palette.chartTrack;
  return palette.chart[(index + 1) % palette.chart.length];
}

/** 平均順位の折れ線の色（右軸・赤） */
export const AVERAGE_RANK_COLOR = palette.fail;
/** ファインダビリティスコアの折れ線の色 */
export const FINDABILITY_COLOR = palette.warn;
