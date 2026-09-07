"use client";

/**
 * カテゴリ別の課題件数。件数の横棒（HBar）と表を並べる。
 * 前回の履歴が無いときは差分の列を出さない（0 と紛らわしくなるため）。
 */
import { HBar } from "@/components/charts";
import { Card, DataTable, type Column } from "@/components/ui";
import type { CategoryCount } from "@/lib/audit/types";
import { palette } from "@/lib/ui/palette";

export function DeltaBadge({ delta }: { delta: number | undefined }) {
  if (delta === undefined) return <span className="text-muted">—</span>;
  if (delta === 0) return <span className="tabular-nums text-muted">±0</span>;
  // 課題は減るのが良いので、増加を fail 色、減少を pass 色にする
  const tone = delta > 0 ? "text-fail" : "text-pass";
  return (
    <span className={`font-bold tabular-nums ${tone}`}>
      {delta > 0 ? "+" : "−"}
      {Math.abs(delta)}
    </span>
  );
}

export function AuditCategoryTable({
  rows,
  hasPrevious,
}: {
  rows: readonly CategoryCount[];
  hasPrevious: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));

  const columns: Column<CategoryCount>[] = [
    {
      key: "category",
      header: "カテゴリ",
      width: "12rem",
      nowrap: true,
      sortable: true,
      accessor: (r) => r.category,
      render: (r) => <span className="font-bold text-ink">{r.category}</span>,
    },
    {
      key: "count",
      header: "件数",
      align: "right",
      width: "5rem",
      sortable: true,
      accessor: (r) => r.count,
      render: (r) => <span className="font-bold tabular-nums text-ink">{r.count}</span>,
    },
    ...(hasPrevious
      ? [
          {
            key: "prev",
            header: "前回",
            align: "right" as const,
            width: "5rem",
            sortable: true,
            accessor: (r: CategoryCount) => r.prevCount ?? null,
            render: (r: CategoryCount) => (
              <span className="tabular-nums text-muted">{r.prevCount ?? "—"}</span>
            ),
          },
          {
            key: "delta",
            header: "前回比",
            align: "right" as const,
            width: "5rem",
            sortable: true,
            accessor: (r: CategoryCount) => r.delta ?? 0,
            render: (r: CategoryCount) => <DeltaBadge delta={r.delta} />,
          },
        ]
      : []),
  ];

  return (
    <Card
      title="カテゴリ別の課題件数"
      description="どの領域に課題が集中しているかを示します。件数はページ数ではなく課題の延べ件数です。"
    >
      <HBar
        className="mb-5"
        rows={rows.map((r) => ({ label: r.category, value: r.count, color: palette.chart[0] }))}
        max={max}
        valueTone="none"
        labelWidth="9rem"
        legend={false}
        ariaLabel="カテゴリ別の課題件数"
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.category}
        dense
        minWidth="28rem"
        emptyText="課題は検出されませんでした。"
      />
    </Card>
  );
}
