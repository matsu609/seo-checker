"use client";

/**
 * 保存済みの MEO 診断報告書の一覧（自社の店舗ごと）。
 *
 * 一番上に**スコアの推移（折れ線）**、そのあとに「最新診断結果」（前回との差分つき）と履歴の表。
 * 「開く」で本文を読み込み、親（MapsTool）の報告書欄に表示する。
 * Supabase 未設定のときは親がこのカード自体を出さない。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください。デモデータを入れて、
 * 最初からこう表示されると分かるように」。**2 回ぶんたまるまでは破線のイメージ**を描く
 * （空の画面にすると、何が出るようになるのか分からないまま離れてしまう）。
 */
import { LineChart, SampleBadge, SampleChart, type LineSeries } from "@/components/charts";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { dayLabel } from "@/lib/demo/dates";
import { sampleScoreTrend } from "@/lib/demo/meo";
import type { MeoHistoryItem } from "@/lib/maps/history";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/maps/score";
import { formatDateTime } from "@/lib/report/format";
import { jstDateKey } from "@/lib/time/jst";
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

/** 折れ線に出す点の数（古い順に最新 12 回ぶん。多いと日付が潰れる） */
export const TREND_POINTS = 12;

/**
 * 履歴（新しい順）→ 折れ線の日付と系列（純粋関数・テスト対象）。
 * 総合 + 4 カテゴリの 5 本。未取得のカテゴリは null（線が切れる。0 点として描かない）。
 */
export function buildScoreTrend(items: readonly MeoHistoryItem[], points = TREND_POINTS): { labels: string[]; series: LineSeries[] } {
  const chrono = [...items].slice(0, points).reverse();
  const labels = chrono.map((i) => dayLabel(jstDateKey(new Date(i.generatedAt))));
  const series: LineSeries[] = [
    { id: "overall", label: "総合", values: chrono.map((i) => i.score), fill: true },
    ...CATEGORY_ORDER.map((id) => ({
      id,
      label: CATEGORY_LABELS[id],
      values: chrono.map((i) => i.categoryScores[id]),
    })),
  ];
  return { labels, series };
}

/** スコアの推移（実測）。2 回ぶん以上たまってから呼ぶ */
function ScoreTrend({ items, placeName }: { items: readonly MeoHistoryItem[]; placeName: string | null }) {
  const { labels, series } = buildScoreTrend(items);
  return (
    <div className="space-y-3">
      <LineChart
        labels={labels}
        series={series}
        yMin={0}
        yMax={100}
        yTicks={[0, 25, 50, 75, 100]}
        height={260}
        format={(v) => (v === null ? "未取得" : `${Math.round(v)}`)}
        nullLabel="未取得"
        xHeader="診断日"
        ariaLabel={`${placeName ?? "自社"} の MEO スコアの推移（${labels[0]}〜${labels[labels.length - 1]}）。総合と 4 カテゴリ`}
      />
      <p className="text-[11px] leading-relaxed text-muted">
        縦軸は 100 点満点の採点です。線が切れているところは、その回に採点できなかったカテゴリです（0 点ではありません）。
        最新 {TREND_POINTS} 回ぶんを描いています。
      </p>
    </div>
  );
}

/** まだ 2 回ぶんたまっていないときの破線のイメージ */
function ScoreTrendSample({ measured }: { measured: number }) {
  const { dates, series } = sampleScoreTrend();
  return (
    <SampleChart
      lead={
        <>
          {measured === 0 ? "まだ診断結果が保存されていません。" : "保存されている診断結果は 1 回ぶんだけです。線としてつながるのは 2 回目からです。"}
          破線は「一斉更新を重ねると、こう見えるようになる」を描いたものです。
        </>
      }
      note={
        <>
          毎週月曜 5:00 の一斉更新で 1 点ずつ増え、<strong className="font-bold">2 回目から線としてつながります</strong>。
          縦軸は 100 点満点の採点で、総合と 4 カテゴリ（基本情報 / 投稿 / 写真 / レビュー）を重ねています。
          「オーナー情報の入力」を埋めると、未取得だった項目も採点に入ります。
        </>
      }
    >
      <LineChart
        labels={dates.map(dayLabel)}
        series={series.map((s) => ({ id: s.id, label: s.label, values: s.values, dashed: true }))}
        yMin={0}
        yMax={100}
        yTicks={[0, 25, 50, 75, 100]}
        height={260}
        format={(v) => (v === null ? "—" : `${Math.round(v)}`)}
        xHeader="診断日（月曜）"
        ariaLabel="診断を重ねたあとの見え方のイメージ（実測ではありません）。縦軸は 100 点満点の採点、横軸はこれからの 4 回"
      />
    </SampleChart>
  );
}

export function MeoHistoryCard({ number, placeName, items, loading, error, openedId, onOpen, onDelete, onReload, busyId }: MeoHistoryCardProps) {
  const latest = items[0] ?? null;
  const previous = items[1] ?? null;
  // 点が 1 つ以下では線にならない。空の画面を出さず、これからの見え方を破線で見せる
  const showSample = items.length < 2;

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
      title="スコアの推移と診断履歴（自社）"
      description="診断のたびにスコアを線で並べます。上がっているか・どのカテゴリが伸びたかを、表を読まずに確かめられます。"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {showSample && <SampleBadge />}
          <Button variant="secondary" size="sm" onClick={onReload} loading={loading} disabled={!placeName}>
            再読み込み
          </Button>
        </div>
      }
      className="no-print"
    >
      {!placeName && <EmptyState title="自社の店舗を選んでください" description="店舗を選ぶと、その店舗の保存済み報告書を表示します。" />}

      {placeName && error && (
        <Callout tone="fail" title="履歴を読み込めませんでした">
          {error}
        </Callout>
      )}

      {/* グラフは画面の先頭。2 回ぶんたまるまでは破線のイメージを描く（空の画面を出さない） */}
      {placeName && !error && !loading && (showSample ? <ScoreTrendSample measured={items.length} /> : <ScoreTrend items={items} placeName={placeName} />)}

      {placeName && !error && latest && (
        <div className="mt-6 space-y-4">
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
