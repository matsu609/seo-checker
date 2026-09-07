/**
 * KPI カード（当期 / 前期 / 増減率）。docs/reference/04_implementation-guide.md §18.1。
 *
 * 前期が 0 のときは増減率を出さない（0% と「計算できない」を混ぜない）。
 */
import { StatCard } from "@/components/ui";
import { formatKpiValue, type SiteKpi } from "@/lib/site-report/kpi";

const ARROW = { up: "↑", down: "↓", flat: "→" } as const;

/** 増減の向き → 文字色。増えるのが良い指標かで反転する */
function arrowClass(kpi: SiteKpi): string {
  const { direction } = kpi.comparison;
  if (direction === "flat") return "text-muted";
  const good = kpi.positiveIsGood ? direction === "up" : direction === "down";
  return good ? "text-pass" : "text-fail";
}

export function KpiCards({ kpis }: { kpis: readonly SiteKpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
      {kpis.map((kpi) => {
        const { comparison } = kpi;
        const previousText = `前期 ${formatKpiValue(kpi.format, comparison.previous)}`;
        return (
          <StatCard
            key={kpi.id}
            label={kpi.label}
            value={
              <span className="inline-flex items-baseline gap-1">
                {formatKpiValue(kpi.format, comparison.current)}
                <span aria-hidden className={`text-[13px] ${arrowClass(kpi)}`}>
                  {ARROW[comparison.direction]}
                </span>
              </span>
            }
            delta={
              comparison.ratio === null
                ? undefined
                : {
                    value: Number((comparison.ratio * 100).toFixed(1)),
                    unit: "%",
                    positiveIsGood: kpi.positiveIsGood,
                    label: previousText,
                  }
            }
            hint={comparison.ratio === null ? `${previousText}（増減率は計算できません）` : kpi.hint}
          />
        );
      })}
    </div>
  );
}
