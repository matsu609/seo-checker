"use client";

/**
 * 「最新の検索順位（自社・競合）」表（docs/reference/04_implementation-guide.md §18.3）。
 *
 * 順位のセル・変化のセルは順位計測（B1）の表と同じ部品を使い、
 * 2 つの画面で同じ色・同じ表記になるようにする。
 */
import { DataTable, type Column } from "@/components/ui";
import { DeltaCell, RankCell } from "@/components/rank/RankTable";
import { shortPath } from "@/lib/rank/rows";
import {
  TREND_CLASSES,
  TREND_LABELS,
  TREND_SYMBOLS,
  type SiteReportRankRow,
} from "@/lib/site-report/table";

export interface RankLatestTableProps {
  rows: readonly SiteReportRankRow[];
  /** 競合列を出すドメイン（「競合の順位を表示」が OFF なら空） */
  competitorDomains: readonly string[];
  emptyText?: string;
}

export function RankLatestTable({ rows, competitorDomains, emptyText }: RankLatestTableProps) {
  const columns: Column<SiteReportRankRow>[] = [
    {
      key: "keyword",
      header: "キーワード",
      accessor: (r) => r.keyword.keyword,
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <span className="text-[13px] text-ink">{r.keyword.keyword}</span>
          {r.groupName && (
            <span className="ml-1 rounded-sm border border-line px-1 text-[11px] text-muted">{r.groupName}</span>
          )}
        </div>
      ),
    },
    {
      key: "volume",
      header: "月間検索数",
      align: "right",
      width: "6rem",
      accessor: (r) => r.volume,
      sortable: true,
      render: (r) =>
        r.volume === null ? (
          <span className="text-[12px] text-muted" title="月間検索数が未登録のためスコアの計算から除外しています">
            未登録
          </span>
        ) : (
          r.volume.toLocaleString("ja-JP")
        ),
    },
    {
      key: "previous",
      header: "前回",
      align: "center",
      width: "5.5rem",
      render: (r) => <RankCell rank={r.previousRank} />,
    },
    {
      key: "current",
      header: "最新",
      align: "center",
      width: "5.5rem",
      accessor: (r) => (r.currentRank === null || r.currentRank === undefined ? 999 : r.currentRank),
      sortable: true,
      render: (r) => <RankCell rank={r.currentRank} />,
    },
    {
      key: "trend",
      header: "変化",
      align: "center",
      width: "5.5rem",
      accessor: (r) => r.trend,
      sortable: true,
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          <DeltaCell row={r} />
          <span className={`text-[11px] ${TREND_CLASSES[r.trend]}`} title={TREND_LABELS[r.trend]}>
            {r.trend === "out" ? TREND_LABELS.out : TREND_SYMBOLS[r.trend]}
          </span>
        </span>
      ),
    },
    ...competitorDomains.map<Column<SiteReportRankRow>>((domain) => ({
      key: `competitor:${domain}`,
      header: domain,
      align: "center",
      width: "5.5rem",
      accessor: (r) => {
        const rank = r.competitors[domain];
        return rank === null || rank === undefined ? 999 : rank;
      },
      sortable: true,
      render: (r) =>
        domain in r.competitors ? (
          <RankCell rank={r.competitors[domain]} />
        ) : (
          <span className="text-[12px] text-muted">未取得</span>
        ),
    })),
    {
      key: "url",
      header: "URL",
      render: (r) =>
        r.current?.url ? (
          <a
            href={r.current.url}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-[12px] text-accent underline-offset-2 hover:underline"
            title={r.current.url}
          >
            {shortPath(r.current.url)}
          </a>
        ) : r.keyword.targetUrl ? (
          <span className="break-all text-[12px] text-muted" title={`目標 URL: ${r.keyword.targetUrl}`}>
            {shortPath(r.keyword.targetUrl)}（目標）
          </span>
        ) : (
          <span className="text-[12px] text-muted">—</span>
        ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.keyword.id}
      minWidth={competitorDomains.length > 0 ? "64rem" : "48rem"}
      emptyText={emptyText ?? "該当するキーワードがありません。"}
      caption={`最新と前回は順位計測（/tools/rank）で保存したスナップショットです。100 位までに見つからなかった場合は「圏外」、その日に計測していない場合は「未取得」と表示します。${
        rows.length > 0 ? `（${rows.length} 件）` : ""
      }`}
    />
  );
}
