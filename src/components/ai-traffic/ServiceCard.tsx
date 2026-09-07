"use client";

/**
 * サービス別内訳（ChatGPT / Gemini / Perplexity / Claude / Copilot …）の積み上げ棒。
 *
 * 系列は topServices が返した順（多い順、6 件目以降は「その他の AI」にまとまる）で、
 * 色は palette.chart の 6 色を先頭から割り当てる。
 */
import { StackedBar } from "@/components/charts";
import { Card, DataTable, EmptyState, type Column } from "@/components/ui";
import {
  formatRatio,
  serviceValues,
  topServices,
  type TrafficBucket,
  type TrafficTotals,
} from "@/lib/ai-traffic/aggregate";
import {
  GRANULARITY_LABELS,
  METRIC_LABELS,
  type Granularity,
  type TrafficMetric,
} from "@/lib/ai-traffic/types";
import { fmt } from "@/lib/report";
import { palette } from "@/lib/ui/palette";

export interface ServiceCardProps {
  buckets: readonly TrafficBucket[];
  totals: TrafficTotals;
  metric: TrafficMetric;
  granularity: Granularity;
}

type ServiceRow = TrafficTotals["services"][number];

export function ServiceCard({ buckets, totals, metric, granularity }: ServiceCardProps) {
  const unit = METRIC_LABELS[metric];
  const services = topServices(buckets);
  const categories = buckets.map((b) => b.label);
  // バケット × サービスの値は 1 回だけ作る（系列ごとに作り直さない）
  const matrix = buckets.map((bucket) => serviceValues(bucket, services));
  const labelEvery = Math.max(1, Math.ceil(categories.length / 12));

  const columns: Column<ServiceRow>[] = [
    { key: "service", header: "サービス", sortable: true, accessor: (r) => r.service },
    {
      key: "value",
      header: unit,
      align: "right",
      sortable: true,
      accessor: (r) => r.value,
      render: (r) => fmt(r.value),
    },
    {
      key: "share",
      header: "AI 流入内の構成比",
      align: "right",
      sortable: true,
      accessor: (r) => r.share,
      render: (r) => formatRatio(r.share),
    },
  ];

  return (
    <Card
      title="サービス別の内訳"
      description="参照元ホストを辞書でサービス名に置き換えて積み上げます。辞書に無い参照元は AI 流入として数えません（下の「参照元辞書」から追加できます）。"
    >
      {totals.ai <= 0 ? (
        <EmptyState
          title="AI 検索からの流入が見つかりませんでした"
          description="この期間の GA4 には、辞書に載っている参照元からのセッションがありませんでした。参照元辞書にホストを追加すると集計対象を広げられます。"
        />
      ) : (
        <>
          <div className="mb-4">
            <StackedBar
              categories={categories}
              series={services.map((service, i) => ({
                label: service,
                color: palette.chart[i % palette.chart.length],
                values: matrix.map((row) => row[i] ?? 0),
              }))}
              width={640}
              height={200}
              labelEvery={labelEvery}
              ariaLabel={`${GRANULARITY_LABELS[granularity]}ごとのサービス別${unit}`}
            />
          </div>
          <DataTable
            rows={totals.services}
            columns={columns}
            rowKey={(row) => row.service}
            defaultSort={{ key: "value", dir: "desc" }}
            dense
            caption={`AI 検索の合計 ${fmt(totals.ai)}（${unit}）の内訳。6 件目以降はグラフでは「その他の AI」にまとめています。`}
          />
        </>
      )}
    </Card>
  );
}
