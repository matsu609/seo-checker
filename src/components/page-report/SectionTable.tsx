"use client";

/**
 * セクションごとの 4 列表（評価項目 / ステータス / 内容 / 備考）。
 * User Insight のレポート画面と同じ形にしてある。
 */
import { Badge, DataTable, type Column } from "@/components/ui";
import type { ReportRow, ReportSection, RowStatus } from "@/lib/page-report/types";

const STATUS_TONE: Record<RowStatus, "pass" | "warn" | "fail"> = {
  適切: "pass",
  良好: "warn",
  要改善: "fail",
};

export function StatusBadge({ status }: { status: RowStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{status}</Badge>;
}

const COLUMNS: Column<ReportRow>[] = [
  {
    key: "item",
    header: "評価項目",
    width: "11rem",
    render: (r) => <span className="font-bold text-ink">{r.item}</span>,
  },
  {
    key: "status",
    header: "ステータス",
    width: "6.5rem",
    nowrap: true,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: "content",
    header: "内容（測定値・評価）",
    render: (r) => <span className="break-all text-ink">{r.content}</span>,
  },
  {
    key: "note",
    header: "備考（詳細・改善提案）",
    render: (r) => <span className="text-muted">{r.note}</span>,
  },
];

export function SectionTable({ section }: { section: ReportSection }) {
  return (
    <section className="print-card">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          {section.label}
          <span className="text-[11px] font-normal text-muted">{section.description}</span>
        </h3>
        <p className="text-[13px] tabular-nums text-muted">
          <span className="font-bold text-ink">{section.points}</span> / {section.weight} 点
        </p>
      </div>
      <DataTable rows={section.rows} columns={COLUMNS} rowKey={(r) => r.item} dense minWidth="44rem" />
    </section>
  );
}

export function SectionTables({ sections }: { sections: readonly ReportSection[] }) {
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <SectionTable key={section.id} section={section} />
      ))}
    </div>
  );
}
