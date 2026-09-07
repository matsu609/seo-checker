"use client";

/**
 * 3 系列（全体 / 自然検索 / AI 検索）の積み上げ棒と、AI 検索率の 2 本の折れ線。
 *
 * 数値はすべて aggregateTraffic / totalsOf が返したものをそのまま出す
 * （グラフ・KPI・CSV で同じ数字にするため、ここでは計算し直さない）。
 */
import { StackedBar } from "@/components/charts";
import { Card, StatStrip } from "@/components/ui";
import { formatRatio, type TrafficBucket, type TrafficTotals } from "@/lib/ai-traffic/aggregate";
import {
  GRANULARITY_LABELS,
  METRIC_LABELS,
  type Granularity,
  type TrafficMetric,
} from "@/lib/ai-traffic/types";
import { fmt } from "@/lib/report";
import { palette } from "@/lib/ui/palette";
import { RatioLines } from "./RatioLines";

export interface TrendCardProps {
  buckets: readonly TrafficBucket[];
  totals: TrafficTotals;
  metric: TrafficMetric;
  granularity: Granularity;
}

/** x ラベルは 12 個くらいに間引く（日次 90 日でも読めるように） */
function labelEveryFor(count: number): number {
  return Math.max(1, Math.ceil(count / 12));
}

export function TrendCard({ buckets, totals, metric, granularity }: TrendCardProps) {
  const unit = METRIC_LABELS[metric];
  const categories = buckets.map((b) => b.label);
  const labelEvery = labelEveryFor(categories.length);

  return (
    <Card
      title="全体 / 自然検索 / AI 検索の推移"
      description={`${GRANULARITY_LABELS[granularity]}ごとの${unit}。積み上げの合計が全体で、重複しないよう分けています。AI 検索は参照元辞書に一致した流入です。`}
    >
      <StatStrip
        className="mb-4"
        items={[
          { label: `全体の${unit}`, value: fmt(totals.total) },
          { label: `自然検索の${unit}`, value: fmt(totals.organic) },
          { label: `AI 検索の${unit}`, value: fmt(totals.ai) },
          { label: "AI 検索率（対総）", value: formatRatio(totals.aiRateTotal) },
          { label: "AI 検索率（対自然検索）", value: formatRatio(totals.aiRateOrganic) },
        ]}
      />

      <div className="mb-6">
        <StackedBar
          categories={categories}
          series={[
            { label: "AI 検索", color: palette.chart[0], values: buckets.map((b) => b.ai) },
            { label: "自然検索（AI 以外）", color: palette.chart[2], values: buckets.map((b) => b.organicOnly) },
            { label: "その他", color: palette.chart[4], values: buckets.map((b) => b.other) },
          ]}
          width={640}
          height={200}
          labelEvery={labelEvery}
          ariaLabel={`${GRANULARITY_LABELS[granularity]}ごとの${unit}（AI 検索・自然検索・その他の積み上げ）`}
        />
        {totals.organicAi > 0 ? (
          // GA4 は一部の AI 参照元を Organic Search に入れるため、同じセッションが
          // 自然検索と AI の両方に数えられる。積み上げでは AI 側にだけ数えていることを断る
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            自然検索に分類された AI 流入が {fmt(totals.organicAi)}
            {unit}あります。積み上げでは AI 検索側にだけ数えているため、「自然検索（AI 以外）」の帯はその分を除いた値です（上の「自然検索の
            {unit}」は除く前の合計）。
          </p>
        ) : null}
      </div>

      <h3 className="mb-2 text-sm font-bold text-ink">AI 検索率</h3>
      <p className="mb-2 text-[12px] leading-relaxed text-muted">
        対総セッションは「AI 検索 ÷ 全体」、対自然検索は「AI 検索 ÷ 自然検索」です。分母が 0 の区間は線を切っています。
      </p>
      <RatioLines
        categories={categories}
        series={[
          {
            key: "total",
            label: "AI 検索率（対総セッション）",
            color: palette.chart[0],
            values: buckets.map((b) => b.aiRateTotal),
          },
          {
            key: "organic",
            label: "AI 検索率（対自然検索）",
            color: palette.chart[3],
            values: buckets.map((b) => b.aiRateOrganic),
          },
        ]}
        labelEvery={labelEvery}
      />
    </Card>
  );
}
