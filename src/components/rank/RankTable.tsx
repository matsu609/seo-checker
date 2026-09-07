"use client";

import { Sparkline } from "@/components/charts";
import { Badge, DataTable, type Column } from "@/components/ui";
import {
  AIO_CLASS_LABELS,
  RANK_BAND_CLASSES,
  RANK_BAND_LABELS,
  RANK_DIRECTION_SYMBOLS,
  rankBand,
  type AioClass,
} from "@/lib/rank/classify";
import { rankText, shortPath, type RankRow } from "@/lib/rank/rows";
import { DEVICE_LABELS } from "@/lib/rank/store";

/** 5 区分ごとのピルの見た目と短いラベル */
const AIO_BADGE: Record<AioClass, { tone: "pass" | "info" | "warn" | "neutral"; label: string }> = {
  self: { tone: "pass", label: "自社" },
  both: { tone: "info", label: "自社&競合" },
  competitor: { tone: "warn", label: "競合のみ" },
  neither: { tone: "neutral", label: "引用なし" },
  none: { tone: "neutral", label: "表示なし" },
};

/** 順位のセル。帯（1〜5 / 6〜10 / 11 位以下 / 圏外）で色を変える */
export function RankCell({ rank }: { rank: number | null | undefined }) {
  if (rank === undefined) return <span className="text-[12px] text-muted">未取得</span>;
  const band = rankBand(rank);
  return (
    <span
      title={RANK_BAND_LABELS[band]}
      className={`inline-flex min-w-9 justify-center rounded-full border px-2 py-0.5 text-[13px] font-bold tabular-nums ${RANK_BAND_CLASSES[band]}`}
    >
      {rankText(rank)}
    </span>
  );
}

/** 変化のセル。上昇 = pass、下降 = fail、圏外の出入りは IN / OUT */
export function DeltaCell({ row }: { row: RankRow }) {
  const { direction, diff } = row.delta;
  if (direction === "unknown") return <span className="text-[12px] text-muted">—</span>;
  const color =
    direction === "up" || direction === "in"
      ? "text-pass"
      : direction === "down" || direction === "out"
        ? "text-fail"
        : "text-muted";
  return (
    <span className={`text-[13px] font-bold tabular-nums ${color}`}>
      {RANK_DIRECTION_SYMBOLS[direction]}
      {diff !== null && diff !== 0 ? Math.abs(diff) : ""}
    </span>
  );
}

/** AI Overviews の 5 区分ピル */
export function AioCell({ aioClass }: { aioClass: AioClass | null }) {
  if (!aioClass) return <span className="text-[12px] text-muted">未取得</span>;
  const badge = AIO_BADGE[aioClass];
  return (
    <Badge tone={badge.tone} icon={false} title={AIO_CLASS_LABELS[aioClass]}>
      {aioClass === "none" ? badge.label : `✨ ${badge.label}`}
    </Badge>
  );
}

export interface RankTableProps {
  rows: readonly RankRow[];
  /** 比較の基準日・前回日（見出しに出す） */
  currentLabel: string;
  previousLabel: string;
  selectedId?: string | null;
  onSelect?: (keywordId: string) => void;
  emptyText?: string;
}

/**
 * 順位表（B1）。キーワード / 推移 / デバイス / 月間検索数 / 最新順位 / 前回 /
 * 変化 / ランディングページ / AI概要。
 */
export function RankTable({ rows, currentLabel, previousLabel, selectedId, onSelect, emptyText }: RankTableProps) {
  const columns: Column<RankRow>[] = [
    {
      key: "keyword",
      header: "キーワード",
      accessor: (r) => r.keyword.keyword,
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(r.keyword.id)}
              className={`text-left text-[13px] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent/40 ${
                selectedId === r.keyword.id ? "font-bold text-accent" : "text-ink"
              }`}
            >
              {r.keyword.keyword}
            </button>
          ) : (
            <span className="text-[13px] text-ink">{r.keyword.keyword}</span>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted">
            {r.groupName && <span className="rounded-sm border border-line px-1">{r.groupName}</span>}
            {r.keyword.location && <span>{r.keyword.location}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "spark",
      header: "推移",
      width: "8rem",
      render: (r) =>
        r.spark.length > 1 ? (
          <Sparkline
            values={r.spark}
            width={96}
            height={24}
            ariaLabel={`${r.keyword.keyword} の順位推移（${r.history.length} 回計測、最新 ${rankText(r.currentRank)}）`}
          />
        ) : (
          <span className="text-[12px] text-muted">—</span>
        ),
    },
    {
      key: "device",
      header: "デバイス",
      width: "5rem",
      nowrap: true,
      accessor: (r) => r.keyword.device,
      sortable: true,
      render: (r) => <span className="text-[12px] text-muted">{DEVICE_LABELS[r.keyword.device]}</span>,
    },
    {
      key: "volume",
      header: "月間検索数",
      align: "right",
      width: "6rem",
      accessor: (r) => r.keyword.monthlyVolume ?? null,
      sortable: true,
      render: (r) =>
        typeof r.keyword.monthlyVolume === "number" ? (
          r.keyword.monthlyVolume.toLocaleString("ja-JP")
        ) : (
          <span className="text-[12px] text-muted">—</span>
        ),
    },
    {
      key: "current",
      header: currentLabel,
      align: "center",
      width: "5.5rem",
      accessor: (r) => (r.currentRank === null || r.currentRank === undefined ? 999 : r.currentRank),
      sortable: true,
      render: (r) => <RankCell rank={r.currentRank} />,
    },
    {
      key: "previous",
      header: previousLabel,
      align: "center",
      width: "5.5rem",
      render: (r) => <RankCell rank={r.previousRank} />,
    },
    {
      key: "delta",
      header: "変化",
      align: "center",
      width: "4.5rem",
      accessor: (r) => r.delta.diff ?? 0,
      sortable: true,
      render: (r) => <DeltaCell row={r} />,
    },
    {
      key: "url",
      header: "ランディングページ",
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
    {
      key: "aio",
      header: "AI概要 ✨",
      align: "center",
      width: "7rem",
      accessor: (r) => r.aioClass ?? "",
      sortable: true,
      render: (r) => <AioCell aioClass={r.aioClass} />,
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.keyword.id}
      minWidth="60rem"
      emptyText={emptyText ?? "キーワードが登録されていません。"}
      caption="順位は Google（gl=jp / hl=ja）の上位 100 件から自社ドメインを探した結果です。100 位までに無い場合は「圏外」と表示します。"
    />
  );
}
