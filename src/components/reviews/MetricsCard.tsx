"use client";

/**
 * 回答の集計。押下率は「Google の投稿ボタンを押した割合」であり、実際の投稿数ではないことを明記する。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください。デモデータを入れて、
 * 最初からグラフがこう表示される・データがこう集計されると直感的に分かるように」。
 * ①週別の推移は表の前に折れ線 ②評価の分布は共通の棒グラフ部品
 * ③**回答が 0 件のときは空の表ではなく破線のイメージ**を描く。
 */
import { Histogram, LineChart, SampleBadge, SampleChart } from "@/components/charts";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { StatStrip } from "@/components/ui/StatCard";
import { dayLabel } from "@/lib/demo/dates";
import { SAMPLE_RATING_DISTRIBUTION, sampleSurveyWeeks } from "@/lib/demo/meo";
import type { ChannelStat, ReviewMetrics, WeekStat } from "@/lib/reviews/metrics";
import { palette } from "@/lib/ui/palette";

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
  { key: "label", header: "店舗・経路（QR）", accessor: (r) => r.label, sortable: true },
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

/** 1〜5 の件数 → 棒グラフの区分（星の多い順に左から。表の並びと同じ） */
export function ratingBands(distribution: readonly number[]) {
  return [5, 4, 3, 2, 1].map((n) => ({
    label: `★${n}`,
    count: distribution[n - 1] ?? 0,
    // 低評価（1〜2）だけ色を変える。ここが対応すべき回答
    color: n <= 2 ? palette.chart[3] : palette.chart[0],
  }));
}

export function MetricsCard({ number, metrics, limit, filtered }: MetricsCardProps) {
  // 回答が 1 件も無いときは、空の表ではなく「これから何が出るか」を見せる
  if (metrics.total === 0) {
    return (
      <Card number={number} title="集計" description="回答数・評価・投稿ボタンの押下率をグラフにします。" actions={<SampleBadge label="イメージ（まだ回答がありません）" />}>
        <MetricsSample />
      </Card>
    );
  }

  const weeks = [...metrics.byWeek].reverse();

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

      {weeks.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-bold text-ink">週別の推移（直近 {weeks.length} 週）</h3>
          <LineChart
            className="mt-2"
            labels={weeks.map((w) => dayLabel(w.weekStart))}
            series={[
              { id: "total", label: "回答数", values: weeks.map((w) => w.total), fill: true },
              { id: "clicks", label: "投稿ボタン押下", values: weeks.map((w) => w.reviewClicks) },
              { id: "low", label: "低評価", values: weeks.map((w) => w.low) },
            ]}
            yMin={0}
            height={220}
            format={(v) => (v === null ? "—" : `${Math.round(v)} 件`)}
            xHeader="週（月曜から）"
            ariaLabel={`週ごとの回答数・投稿ボタンの押下数・低評価の推移（${weeks[0]?.weekStart} 週から）`}
          />
        </>
      )}

      <h3 className="mt-6 text-sm font-bold text-ink">評価の分布</h3>
      <Histogram className="mt-2" bands={ratingBands(metrics.distribution)} ariaLabel="評価ごとの回答数" />
      <p className="mt-1 text-[11px] text-muted">色の濃い棒（★1・★2）が、先に対応すべき低評価です。</p>

      <h3 className="mt-6 text-sm font-bold text-ink">店舗・経路別（QR ごと）</h3>
      <DataTable className="mt-2" rows={metrics.byChannel} columns={CHANNEL_COLUMNS} rowKey={(r) => r.channelId ?? "none"} dense emptyText="回答がまだありません。" />

      <h3 className="mt-6 text-sm font-bold text-ink">週別の内訳（表）</h3>
      <DataTable className="mt-2" rows={metrics.byWeek} columns={WEEK_COLUMNS} rowKey={(r) => r.weekStart} dense emptyText="回答がまだありません。" />
    </Card>
  );
}

/* ───────────── 回答が入る前のイメージ（破線） ───────────── */

function MetricsSample() {
  const { weeks, answers, clicks } = sampleSurveyWeeks();
  return (
    <SampleChart
      lead="まだ回答がありません。QR コードを店内に置いて読み取ってもらうと、この形の実線に置き換わります。"
      note={
        <>
          横軸は週（月曜から）です。回答が入った翌日から点が増え、
          <strong className="font-bold">2 週目から線としてつながります</strong>。
          「投稿ボタン押下」は Google マップへの投稿ボタンを押した回数で、実際に投稿された数ではありません。
        </>
      }
    >
      <LineChart
        labels={weeks.map(dayLabel)}
        series={[
          { id: "sample-total", label: "回答数", values: answers, dashed: true },
          { id: "sample-clicks", label: "投稿ボタン押下", values: clicks, dashed: true },
        ]}
        yMin={0}
        height={220}
        format={(v) => (v === null ? "—" : `${Math.round(v)} 件`)}
        xHeader="週（月曜から）"
        ariaLabel="回答が集まったあとの見え方のイメージ（実測ではありません）。縦軸は件数、横軸はこれからの 4 週"
      />
      <div>
        <h3 className="text-sm font-bold text-ink">評価の分布（イメージ）</h3>
        <Histogram className="mt-2" bands={ratingBands(SAMPLE_RATING_DISTRIBUTION)} ariaLabel="評価ごとの回答数の見え方のイメージ（実測ではありません）" />
      </div>
    </SampleChart>
  );
}
