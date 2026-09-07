"use client";

import { useMemo } from "react";
import { StackedBar } from "@/components/charts";
import { Badge, Card, EmptyState, Select, StatStrip } from "@/components/ui";
import {
  AIO_CLASS_COLORS,
  AIO_CLASS_HINTS,
  AIO_CLASS_LABELS,
  AIO_CLASS_ORDER,
  aioClassLabel,
  aioTimeline,
  classifyAio,
  formatRate,
} from "@/lib/rank/classify";
import { snapshotsFor, toObservations, type RankKeyword, type RankSnapshot } from "@/lib/rank/store";

export interface AioPanelProps {
  keywords: readonly RankKeyword[];
  snapshots: readonly RankSnapshot[];
  projectDomain: string;
  selectedId: string | null;
  onSelect: (keywordId: string) => void;
}

function isSelf(domain: string, projectDomain: string): boolean {
  if (!projectDomain || !domain) return false;
  return domain === projectDomain || domain.endsWith(`.${projectDomain}`);
}

/** 日付を MM/DD にする（グラフの x ラベル） */
function shortDate(date: string): string {
  const [, m, d] = date.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : date;
}

/**
 * AI Overviews の引用状況（B3）。
 * 5 区分の積み上げ棒（日次）と、選んだキーワードの AIO 本文・引用サイトを出す。
 */
export function AioPanel({ keywords, snapshots, projectDomain, selectedId, onSelect }: AioPanelProps) {
  const ids = useMemo(() => keywords.map((k) => k.id), [keywords]);
  const timeline = useMemo(
    () => aioTimeline(toObservations(snapshots.filter((s) => ids.includes(s.keywordId))), ids),
    [snapshots, ids],
  );
  const latest = timeline[timeline.length - 1];

  const selected = keywords.find((k) => k.id === selectedId) ?? keywords[0] ?? null;
  const selectedHistory = selected ? snapshotsFor(snapshots, selected.id) : [];
  const latestSnapshot = selectedHistory[selectedHistory.length - 1];
  const aio = latestSnapshot?.aiOverview;

  if (keywords.length === 0) {
    return (
      <EmptyState
        title="対象のキーワードがありません"
        description="「キーワード」タブでキーワードを登録し、計測すると、ここに AI Overviews の引用状況が表示されます。"
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card
        title="登録キーワードの AI Overviews 引用状況"
        headingLevel={3}
        description="計測した日ごとに、AI による概要の表示と自社・競合の引用を 5 区分で数えます。未取得の日は分母から外します。"
      >
        {timeline.length === 0 ? (
          <EmptyState
            title="まだ計測結果がありません"
            description="「計測する」を実行すると、その日の 5 区分がここに積み上がります。"
          />
        ) : (
          <>
            <StatStrip
              items={[
                { label: "登録キーワード", value: ids.length, unit: "件" },
                { label: "出現率（最新日）", value: formatRate(latest?.presenceRate ?? 0) },
                { label: "引用率（最新日）", value: formatRate(latest?.citationRate ?? 0) },
                { label: "未取得（最新日）", value: latest?.missing ?? 0, unit: "件" },
              ]}
            />
            <div className="mt-5 overflow-x-auto">
              <StackedBar
                categories={timeline.map((p) => shortDate(p.date))}
                series={AIO_CLASS_ORDER.map((c) => ({
                  label: AIO_CLASS_LABELS[c],
                  color: AIO_CLASS_COLORS[c],
                  values: timeline.map((p) => p.counts[c]),
                }))}
                width={Math.max(360, Math.min(880, timeline.length * 56))}
                height={180}
                labelEvery={timeline.length > 12 ? Math.ceil(timeline.length / 12) : 1}
                ariaLabel="日付ごとの AI Overviews 引用状況（5 区分）"
              />
            </div>
            <table className="mt-4 w-full text-[13px] text-ink">
              <caption className="mb-2 text-left text-[12px] text-muted">最新日（{latest?.date}）の内訳</caption>
              <thead>
                <tr className="border-b border-line text-[12px] font-bold text-muted">
                  <th scope="col" className="px-2 py-2 text-left">区分</th>
                  <th scope="col" className="px-2 py-2 text-right">件数</th>
                  <th scope="col" className="px-2 py-2 text-left">意味</th>
                </tr>
              </thead>
              <tbody>
                {AIO_CLASS_ORDER.map((c) => (
                  <tr key={c} className="border-b border-line last:border-0">
                    <td className="px-2 py-1.5">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden
                          className="inline-block h-3 w-3 rounded-sm"
                          style={{ backgroundColor: AIO_CLASS_COLORS[c] }}
                        />
                        {AIO_CLASS_LABELS[c]}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{latest?.counts[c] ?? 0}</td>
                    <td className="px-2 py-1.5 text-[12px] text-muted">{AIO_CLASS_HINTS[c]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      <Card
        title="今日の検索結果（AI による概要）"
        headingLevel={3}
        description="キーワードを選ぶと、直近の計測で取得した AI による概要の本文と引用サイトを表示します。"
        actions={
          <Select
            aria-label="表示するキーワード"
            value={selected?.id ?? ""}
            onChange={(e) => onSelect(e.target.value)}
            className="h-9 w-56 text-[13px]"
          >
            {keywords.map((k) => (
              <option key={k.id} value={k.id}>
                {k.keyword}
              </option>
            ))}
          </Select>
        }
      >
        {!latestSnapshot ? (
          <p className="text-[13px] text-muted">このキーワードはまだ計測されていません。</p>
        ) : aio?.unavailable ? (
          <p className="text-[13px] text-muted">
            直近の計測（{latestSnapshot.takenOn}）では AI による概要の本文を取得できませんでした（未取得）。
            この日は集計の分母から外れています。もう一度計測すると取得できることがあります。
          </p>
        ) : !aio?.present ? (
          <p className="text-[13px] text-muted">
            直近の計測（{latestSnapshot.takenOn}）では AI による概要は表示されませんでした。
          </p>
        ) : (
          <>
            <p className="text-[12px] text-muted">
              取得日 {latestSnapshot.takenOn} ・ 区分「{aioClassLabel(classifyAio(aio))}」
            </p>
            {aio.text ? (
              <p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-ink">
                {aio.text}
              </p>
            ) : (
              <p className="mt-2 text-[13px] text-muted">
                本文は保存されていません（履歴では最新の 1 件だけ本文を保持します）。もう一度計測すると表示されます。
              </p>
            )}
            <h4 className="mt-4 text-sm font-bold text-ink">引用サイト（{aio.references.length} 件）</h4>
            {aio.references.length === 0 ? (
              <p className="mt-1 text-[13px] text-muted">引用元は取得できませんでした。</p>
            ) : (
              <ol className="mt-1 space-y-1 text-[13px]">
                {aio.references.map((r, i) => (
                  <li key={r.url} className="border-b border-line py-1 last:border-0">
                    <span className="mr-1 text-[11px] text-muted tabular-nums">{i + 1}.</span>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-accent underline-offset-2 hover:underline"
                    >
                      {r.title}
                    </a>
                    <span className="ml-1 text-[11px] text-muted">{r.domain}</span>
                    {isSelf(r.domain, projectDomain) && (
                      <Badge tone="pass" className="ml-1">
                        自社
                      </Badge>
                    )}
                    {aio.citedCompetitors?.some((d) => r.domain === d || r.domain.endsWith(`.${d}`)) && (
                      <Badge tone="warn" className="ml-1">
                        競合
                      </Badge>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
