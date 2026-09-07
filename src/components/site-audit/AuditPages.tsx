"use client";

/**
 * 診断したページの一覧と、取得できなかったページ。
 * 課題件数の多い順に並べ、どのページから手を付けるかを決められるようにする。
 */
import { Badge, Card, DataTable, type Column } from "@/components/ui";
import type { AuditFailure, AuditPageRow } from "@/lib/audit/types";
import { fmt, pathOf, truncateMiddle } from "@/lib/report";

export function AuditPages({
  pages,
  failures,
}: {
  pages: readonly AuditPageRow[];
  failures: readonly AuditFailure[];
}) {
  const columns: Column<AuditPageRow>[] = [
    {
      key: "url",
      header: "パス",
      sortable: true,
      accessor: (r) => pathOf(r.url),
      render: (r) => (
        <a
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-accent underline-offset-2 hover:underline"
        >
          {pathOf(r.url)}
        </a>
      ),
    },
    {
      key: "title",
      header: "title",
      sortable: true,
      accessor: (r) => r.title ?? "",
      render: (r) =>
        r.title ? (
          <span className="text-ink">{truncateMiddle(r.title, 40)}</span>
        ) : (
          <Badge tone="fail">なし</Badge>
        ),
    },
    {
      key: "issues",
      header: "課題",
      align: "right",
      width: "4rem",
      sortable: true,
      accessor: (r) => r.issues,
      render: (r) => <span className="font-bold tabular-nums text-ink">{r.issues}</span>,
    },
    {
      key: "chars",
      header: "本文",
      align: "right",
      width: "5.5rem",
      sortable: true,
      accessor: (r) => r.mainTextLength,
      render: (r) => <span className="tabular-nums text-muted">{fmt(r.mainTextLength)} 字</span>,
    },
    {
      key: "depth",
      header: "階層",
      align: "right",
      width: "4rem",
      sortable: true,
      accessor: (r) => r.depth ?? 99,
      render: (r) => <span className="tabular-nums text-muted">{r.depth ?? "—"}</span>,
    },
    {
      key: "inlinks",
      header: "被リンク",
      align: "right",
      width: "5rem",
      sortable: true,
      accessor: (r) => r.inlinks,
      render: (r) => <span className="tabular-nums text-muted">{r.inlinks}</span>,
    },
    {
      key: "loadMs",
      header: "取得時間",
      align: "right",
      width: "6rem",
      sortable: true,
      accessor: (r) => r.loadMs ?? -1,
      render: (r) =>
        r.loadMs === null ? (
          <span className="text-muted">未計測</span>
        ) : (
          <span className="tabular-nums text-muted">{fmt(r.loadMs)} ms</span>
        ),
    },
  ];

  return (
    <>
      <Card
        title="診断したページ"
        description="課題の多い順に並べています。「取得時間」は先頭の数ページだけ実測しています（未計測の行は測っていないという意味で、速いという意味ではありません）。"
      >
        <DataTable
          rows={pages}
          columns={columns}
          rowKey={(r) => r.url}
          defaultSort={{ key: "issues", dir: "desc" }}
          dense
          minWidth="48rem"
          emptyText="診断できたページがありません。"
        />
      </Card>

      {failures.length > 0 && (
        <Card
          title="診断できなかったページ"
          description="取得に失敗した URL です。リンク切れやサーバーエラーの可能性があります。"
        >
          <DataTable
            rows={failures}
            columns={[
              {
                key: "url",
                header: "URL",
                render: (r: AuditFailure) => <span className="break-all text-ink">{r.url}</span>,
              },
              {
                key: "message",
                header: "理由",
                width: "18rem",
                render: (r: AuditFailure) => <span className="text-muted">{r.message}</span>,
              },
            ]}
            rowKey={(r) => r.url}
            dense
            minWidth="34rem"
          />
        </Card>
      )}
    </>
  );
}
