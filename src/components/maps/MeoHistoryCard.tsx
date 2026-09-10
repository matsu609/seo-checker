"use client";

/**
 * 保存済みの MEO 診断報告書の一覧（自社の店舗ごと）。
 *
 * 一番上に「最新診断結果」（前回との差分つき）、その下に履歴の表。
 * 「開く」で本文を読み込み、親（MapsTool）の報告書欄に表示する。
 * Supabase 未設定のときは親がこのカード自体を出さない。
 */
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import type { MeoHistoryItem } from "@/lib/maps/history";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/maps/score";
import { formatDateTime } from "@/lib/report/format";
import type { Grade } from "@/lib/ui/grade";

export interface MeoHistoryCardProps {
  number: number;
  placeName: string | null;
  items: MeoHistoryItem[];
  loading: boolean;
  error: string | null;
  /** いま報告書欄に表示している履歴の ID */
  openedId: string | null;
  onOpen: (item: MeoHistoryItem) => void;
  onDelete: (item: MeoHistoryItem) => void;
  onReload: () => void;
  busyId: string | null;
}

/** 前回との差（+3 / −2 / ±0）。どちらかが無ければ null */
export function scoreDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

function DeltaLabel({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-muted">—</span>;
  const cls = delta > 0 ? "text-pass" : delta < 0 ? "text-fail" : "text-muted";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  return (
    <span className={`tabular-nums ${cls}`}>
      {sign}
      {Math.abs(delta)}
    </span>
  );
}

export function MeoHistoryCard({ number, placeName, items, loading, error, openedId, onOpen, onDelete, onReload, busyId }: MeoHistoryCardProps) {
  const latest = items[0] ?? null;
  const previous = items[1] ?? null;

  const columns: Column<MeoHistoryItem>[] = [
    {
      key: "generatedAt",
      header: "診断日時",
      nowrap: true,
      render: (r) => (
        <span className={r.id === openedId ? "font-bold text-ink" : undefined}>{formatDateTime(r.generatedAt)}</span>
      ),
    },
    {
      key: "score",
      header: "総合",
      align: "right",
      accessor: (r) => r.score,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold tabular-nums">{r.score ?? "—"}</span>
          {r.grade && (
            <Badge tone="grade" grade={r.grade as Grade} icon={false}>
              {r.grade}
            </Badge>
          )}
        </span>
      ),
    },
    ...CATEGORY_ORDER.map<Column<MeoHistoryItem>>((id) => ({
      key: id,
      header: CATEGORY_LABELS[id],
      align: "right",
      accessor: (r) => r.categoryScores[id],
      render: (r) => <span className="tabular-nums">{r.categoryScores[id] ?? "—"}</span>,
    })),
    {
      key: "actions",
      header: "",
      nowrap: true,
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => onOpen(r)} disabled={r.id === openedId} loading={busyId === r.id}>
            {r.id === openedId ? "表示中" : "開く"}
          </Button>
          <Button size="sm" variant="danger" onClick={() => onDelete(r)} disabled={busyId !== null}>
            削除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      number={number}
      title="診断履歴（自社）"
      description="「保存」した診断報告書を店舗ごとに残します。前回と比べてスコアがどう動いたかを確認できます。"
      actions={
        <Button variant="secondary" size="sm" onClick={onReload} loading={loading} disabled={!placeName}>
          再読み込み
        </Button>
      }
      className="no-print"
    >
      {!placeName && <EmptyState title="自社の店舗を選んでください" description="店舗を選ぶと、その店舗の保存済み報告書を表示します。" />}

      {placeName && error && (
        <Callout tone="fail" title="履歴を読み込めませんでした">
          {error}
        </Callout>
      )}

      {placeName && !error && items.length === 0 && !loading && (
        <EmptyState
          title="保存済みの報告書はまだありません"
          description="上の診断レポートで「保存」を押すと、ここに履歴として残ります。"
        />
      )}

      {placeName && !error && latest && (
        <div className="space-y-4">
          <div className="rounded-sm border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-[13px] font-bold text-ink">最新診断結果</h3>
              <span className="text-[12px] text-muted">
                {formatDateTime(latest.generatedAt)}
                {previous && <>（前回 {formatDateTime(previous.generatedAt)} との差）</>}
              </span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <dt className="text-[11px] text-muted">総合</dt>
                <dd className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold tabular-nums text-ink">{latest.score ?? "—"}</span>
                  {latest.grade && (
                    <Badge tone="grade" grade={latest.grade as Grade} icon={false}>
                      {latest.grade}
                    </Badge>
                  )}
                  <DeltaLabel delta={previous ? scoreDelta(latest.score, previous.score) : null} />
                </dd>
              </div>
              {CATEGORY_ORDER.map((id) => (
                <div key={id}>
                  <dt className="text-[11px] text-muted">{CATEGORY_LABELS[id]}</dt>
                  <dd className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-lg font-bold tabular-nums text-ink">{latest.categoryScores[id] ?? "—"}</span>
                    <DeltaLabel delta={previous ? scoreDelta(latest.categoryScores[id], previous.categoryScores[id]) : null} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <DataTable rows={items} columns={columns} rowKey={(r) => r.id} dense minWidth="44rem" emptyText="" />
          <p className="text-[11px] text-muted">最新 50 件まで表示します。削除した報告書は元に戻せません。</p>
        </div>
      )}
    </Card>
  );
}
