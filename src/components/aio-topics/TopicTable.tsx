"use client";

import { Sparkline } from "@/components/charts";
import { DataTable, type Column } from "@/components/ui";
import { COVERAGE_LABELS, PRIORITY_COLORS, type TopicRow } from "@/lib/aio-topics/aggregate";
import { formatRate } from "@/lib/rank/classify";

/** 優先度 1〜5 のドット表示（色だけに頼らないよう数値も添える） */
export function PriorityDots({ priority }: { priority: number }) {
  const color = PRIORITY_COLORS[priority] ?? PRIORITY_COLORS[1];
  return (
    <span className="inline-flex items-center gap-1" title={`優先度 ${priority} / 5`}>
      <span className="sr-only">優先度 {priority} / 5</span>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block h-2 w-2 rounded-full border"
          style={{
            backgroundColor: i <= priority ? color : "transparent",
            borderColor: i <= priority ? color : "currentColor",
            opacity: i <= priority ? 1 : 0.25,
          }}
        />
      ))}
      <span aria-hidden className="ml-1 text-[12px] font-bold tabular-nums" style={{ color }}>
        {priority}
      </span>
    </span>
  );
}

/** 前期比。増加は fail 寄り（対応が必要）ではなく事実として ink で出し、記号で向きを示す */
function DeltaText({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-[11px] text-muted">前期比 —</span>;
  const sign = delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
  const color = delta > 0 ? "text-pass" : delta < 0 ? "text-fail" : "text-muted";
  return (
    <span className={`text-[11px] tabular-nums ${color}`}>
      前期比 {sign}
      {formatRate(Math.abs(delta))}
    </span>
  );
}

export interface TopicTableProps {
  rows: readonly TopicRow[];
  coverageJudged: boolean;
}

/** AIO 頻出トピックの表（トピック / 出現の割合 / 傾向 / 自社ページ / 優先度） */
export function TopicTable({ rows, coverageJudged }: TopicTableProps) {
  const columns: Column<TopicRow>[] = [
    {
      key: "label",
      header: "AIOのトピック",
      accessor: (r) => r.label,
      sortable: true,
      render: (r) => <span className="text-[13px] text-ink">{r.label}</span>,
    },
    {
      key: "share",
      header: "出現の割合",
      align: "right",
      width: "8rem",
      accessor: (r) => r.share,
      sortable: true,
      render: (r) => (
        <div>
          <div className="text-[13px] font-bold tabular-nums text-ink">{formatRate(r.share)}</div>
          <DeltaText delta={r.shareDelta} />
        </div>
      ),
    },
    {
      key: "trend",
      header: "出現の傾向",
      width: "8rem",
      render: (r) =>
        r.trend.length > 1 ? (
          <Sparkline
            values={r.trend.map((v) => Math.round(v * 100))}
            width={96}
            height={24}
            ariaLabel={`${r.label} の出現割合の推移（最新 ${formatRate(r.trend[r.trend.length - 1])}）`}
          />
        ) : (
          <span className="text-[12px] text-muted">—</span>
        ),
    },
    {
      key: "coverage",
      header: "自社ページ",
      width: "7rem",
      accessor: (r) => r.coverage ?? "",
      sortable: true,
      render: (r) => (
        <span className={`text-[12px] ${r.coverage === "none" ? "text-fail" : r.coverage === "partial" ? "text-warn" : r.coverage === "full" ? "text-pass" : "text-muted"}`}>
          {r.coverage ? COVERAGE_LABELS[r.coverage] : coverageJudged ? "未判定" : "—"}
        </span>
      ),
    },
    {
      key: "priority",
      header: "優先度",
      align: "center",
      width: "8rem",
      accessor: (r) => r.priority,
      sortable: true,
      render: (r) => <PriorityDots priority={r.priority} />,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.topicId}
      minWidth="44rem"
      emptyText="まだトピックがありません。AI による概要を取得すると抽出されます。"
      caption="出現の割合 = そのトピックが出た日数 ÷ AI による概要が表示された日数。優先度 = 出現の割合 × 傾向 × 自社ページの未カバー度。"
    />
  );
}
