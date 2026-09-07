"use client";

/**
 * AI クローラごとの robots.txt 判定（学習用 / 検索用 / ユーザー操作時に分けて表示）。
 * 「学習は断るが検索には出したい」という選択があるため、用途を混ぜて 1 つの
 * 良し悪しにまとめない。
 */
import { Badge, DataTable, type Column } from "@/components/ui";
import { PURPOSE_LABELS, type BotVerdict, type RobotsMatrix } from "@/lib/page-report/robots";

const COLUMNS: Column<BotVerdict>[] = [
  {
    key: "ua",
    header: "User-agent",
    width: "12rem",
    sortable: true,
    accessor: (r) => r.ua,
    render: (r) => <code className="font-mono text-[12px] text-ink">{r.ua}</code>,
  },
  {
    key: "vendor",
    header: "事業者",
    width: "8rem",
    sortable: true,
    accessor: (r) => r.vendor,
  },
  {
    key: "purpose",
    header: "用途",
    width: "7rem",
    nowrap: true,
    sortable: true,
    accessor: (r) => r.purpose,
    render: (r) => <Badge tone="neutral">{PURPOSE_LABELS[r.purpose]}</Badge>,
  },
  {
    key: "allowed",
    header: "判定",
    width: "6rem",
    nowrap: true,
    sortable: true,
    accessor: (r) => (r.allowed ? 1 : 0),
    render: (r) => <Badge tone={r.allowed ? "pass" : "fail"}>{r.allowed ? "許可" : "拒否"}</Badge>,
  },
  {
    key: "note",
    header: "説明",
    render: (r) => (
      <span className="text-muted">
        {r.note}
        <span className="ml-1 text-[11px]">（{r.reason}）</span>
      </span>
    ),
  },
];

export function BotMatrix({ robots }: { robots: RobotsMatrix }) {
  return (
    <>
      <p className="mb-3 text-[13px] leading-relaxed text-muted">
        {robots.exists
          ? "robots.txt を読み取り、AI クローラごとにこのページを取得できるかを判定しました。"
          : "robots.txt が見つからないため、すべてのクローラが許可されている状態です（クローラの既定の扱い）。"}
        {" "}
        検索用を拒否すると AI 検索の回答に載る機会そのものを失います。学習用の拒否は方針としての選択です。
      </p>
      <DataTable
        rows={robots.bots}
        columns={COLUMNS}
        rowKey={(r) => r.ua}
        dense
        minWidth="46rem"
        defaultSort={{ key: "allowed", dir: "asc" }}
      />
    </>
  );
}
