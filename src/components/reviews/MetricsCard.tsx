"use client";

/**
 * 回答の集計。押下率は「Google の投稿ボタンを押した割合」であり、実際の投稿数ではないことを明記する。
 */
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatStrip } from "@/components/ui/StatCard";
import type { ChannelStat, ReviewMetrics, WeekStat } from "@/lib/reviews/metrics";

export interface MetricsCardProps {
  number: number;
  metrics: ReviewMetrics;
  /** 一覧の取得上限（集計の範囲） */
  limit: number;
  /** 絞り込みが効いているか（集計は絞り込み後の範囲） */
  filtered: boolean;
}

function rating(v: number | null): string {
  return v === null ? "–" : v.toFixed(2);
}

function rate(clicks: number, total: number): string {
  return total === 0 ? "–" : `${Math.round((clicks / total) * 1000) / 10}%`;
}

const CHANNEL_COLUMNS: readonly Column<ChannelStat>[] = [
  { key: "label", header: "経路（QR）", accessor: (r) => r.label, sortable: true },
  { key: "total", header: "回答数", accessor: (r) => r.total, align: "right", sortable: true },
  { key: "avg", header: "平均評価", accessor: (r) => r.averageRating, render: (r) => rating(r.averageRating), align: "right", sortable: true },
  { key: "low", header: "低評価", accessor: (r) => r.low, align: "right", sortable: true },
  { key: "clicks", header: "投稿ボタン押下", accessor: (r) => r.reviewClicks, render: (r) => `${r.reviewClicks}（${rate(r.reviewClicks, r.total)}）`, align: "right", sortable: true },
];

const WEEK_COLUMNS: readonly Column<WeekStat>[] = [
  { key: "week", header: "週（月曜から）", accessor: (r) => r.weekStart, sortable: true },
  { key: "total", header: "回答数", accessor: (r) => r.total, align: "right" },
  { key: "avg", header: "平均評価", accessor: (r) => r.averageRating, render: (r) => rating(r.averageRating), align: "right" },
  { key: "low", header: "低評価", accessor: (r) => r.low, align: "right" },
  { key: "clicks", header: "投稿ボタン押下", accessor: (r) => r.reviewClicks, render: (r) => `${r.reviewClicks}（${rate(r.reviewClicks, r.total)}）`, align: "right" },
];

export function MetricsCard({ number, metrics, limit, filtered }: MetricsCardProps) {
  const max = Math.max(1, ...metrics.distribution);
  return (
    <Card
      number={number}
      title="集計"
      description={`回答数・評価・投稿ボタンの押下率。${filtered ? "下の絞り込みが効いた範囲の集計です。" : ""}集計は新しい順に最大 ${limit.toLocaleString("ja-JP")} 件です。`}
    >
      <StatStrip
        items={[
          { label: "回答数", value: metrics.total.toLocaleString("ja-JP"), unit: "件" },
          { label: "平均評価", value: rating(metrics.averageRating), unit: "/ 5" },
          { label: "低評価", value: metrics.low.toLocaleString("ja-JP"), unit: `件（未対応 ${metrics.lowOpen}）` },
          { label: "投稿ボタン押下率", value: metrics.reviewClickRate === null ? "–" : `${metrics.reviewClickRate}%`, unit: `（${metrics.reviewClicks} 件）` },
          { label: "お店に直接伝える", value: metrics.directMessages.toLocaleString("ja-JP"), unit: "件" },
        ]}
      />
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        「投稿ボタン押下」は来店客が「Google マップに投稿する」を押した回数です。Google からは投稿の通知（コールバック）が取れないため、
        <strong>実際に投稿された数は計測できません。</strong>近似値としてお使いください。口コミ件数の実数は「Google マップ・店舗情報」の週次更新で追えます。
      </p>

      <h3 className="mt-6 text-sm font-bold text-ink">評価の分布</h3>
      <ol className="mt-2 space-y-1">
        {[5, 4, 3, 2, 1].map((n) => {
          const count = metrics.distribution[n - 1]!;
          return (
            <li key={n} className="flex items-center gap-2 text-[13px]">
              <span className="w-6 shrink-0 text-right tabular-nums text-muted">{n}</span>
              <span className="h-3 flex-1 rounded-sm bg-surface">
                <span className="block h-3 rounded-sm bg-accent" style={{ width: `${(count / max) * 100}%` }} aria-hidden />
              </span>
              <span className="w-12 shrink-0 text-right tabular-nums text-ink">{count} 件</span>
            </li>
          );
        })}
      </ol>

      <h3 className="mt-6 text-sm font-bold text-ink">経路別</h3>
      <DataTable className="mt-2" rows={metrics.byChannel} columns={CHANNEL_COLUMNS} rowKey={(r) => r.channelId ?? "none"} dense emptyText="回答がまだありません。" />

      <h3 className="mt-6 text-sm font-bold text-ink">週別の推移（直近 8 週）</h3>
      <DataTable className="mt-2" rows={metrics.byWeek} columns={WEEK_COLUMNS} rowKey={(r) => r.weekStart} dense emptyText="回答がまだありません。" />
    </Card>
  );
}
