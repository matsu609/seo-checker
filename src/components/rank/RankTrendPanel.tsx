"use client";

/**
 * 順位の推移（折れ線）。手動計測と毎週の自動計測の履歴を同じ線に並べる。
 *
 * 系列は多すぎると読めないので、最初は最新順位が良い順に 4 語を出し、チェックで最大 6 語まで選べる
 * （色は 6 色を固定順で使い、循環させない）。
 */
import { useMemo, useState } from "react";
import { LineChart, type LineSeries } from "@/components/charts";
import { EmptyState } from "@/components/ui";
import { storedDates } from "@/lib/rank/classify";
import { DEVICE_LABELS, type RankKeyword, type RankSnapshot } from "@/lib/rank/store";
import { MAX_RANK } from "@/lib/rank/types";

export const TREND_DEFAULT = 4;
export const TREND_MAX = 6;

export interface RankTrendPanelProps {
  keywords: readonly RankKeyword[];
  snapshots: readonly RankSnapshot[];
}

/** 語ごとの系列（日付 × 順位）。純粋（テストしやすいよう外に出す） */
export function buildTrendSeries(keywords: readonly RankKeyword[], snapshots: readonly RankSnapshot[]): { labels: string[]; series: (LineSeries & { latest: number | null })[] } {
  const labels = storedDates(snapshots);
  const series = keywords.map((k) => {
    const own = snapshots.filter((s) => s.keywordId === k.id);
    const byDate = new Map(own.map((s) => [s.takenOn, s.rank]));
    const values = labels.map((d) => (byDate.has(d) ? (byDate.get(d) ?? null) : null));
    const latestSnap = [...own].sort((a, b) => b.takenOn.localeCompare(a.takenOn))[0];
    return { id: k.id, label: keywords.some((o) => o.id !== k.id && o.keyword === k.keyword) ? `${k.keyword}（${DEVICE_LABELS[k.device]}）` : k.keyword, values, latest: latestSnap ? latestSnap.rank : null };
  });
  return { labels, series };
}

/** 既定で出す語（最新の順位が良い順。圏外・未取得は後ろ） */
export function defaultSelection(series: readonly { id: string; latest: number | null }[], count = TREND_DEFAULT): string[] {
  return [...series]
    .sort((a, b) => (a.latest ?? MAX_RANK + 1) - (b.latest ?? MAX_RANK + 1))
    .slice(0, count)
    .map((s) => s.id);
}

export function RankTrendPanel({ keywords, snapshots }: RankTrendPanelProps) {
  const { labels, series } = useMemo(() => buildTrendSeries(keywords, snapshots), [keywords, snapshots]);
  const [selected, setSelected] = useState<string[] | null>(null);
  const chosen = selected ?? defaultSelection(series);
  const shown = series.filter((s) => chosen.includes(s.id));

  function toggle(id: string) {
    const next = chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length >= TREND_MAX ? chosen : [...chosen, id];
    setSelected(next);
  }

  if (labels.length < 2) {
    return <EmptyState title="推移はまだ描けません" description="2 回以上の計測が必要です。毎週火曜の自動計測で自動的にたまります。" />;
  }

  return (
    <div className="space-y-4">
      <LineChart
        labels={labels}
        series={shown}
        invert
        yMin={1}
        yMax={Math.max(10, ...shown.flatMap((s) => s.values).filter((v): v is number => v !== null))}
        format={(v) => (v === null ? "圏外" : `${v} 位`)}
        nullLabel="圏外 / 未取得"
        ariaLabel={`${shown.length} 語の順位の推移（${labels[0]}〜${labels[labels.length - 1]}）`}
        height={260}
      />
      <p className="text-[11px] text-muted">上が 1 位。圏外（100 位より下）と未取得の日は線が切れます。手動の計測と毎週の自動計測を同じ線に並べています。</p>
      <fieldset>
        <legend className="mb-1 text-[12px] font-bold text-ink">表示する語（{TREND_MAX} 語まで）</legend>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
          {series.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={chosen.includes(s.id)} onChange={() => toggle(s.id)} disabled={!chosen.includes(s.id) && chosen.length >= TREND_MAX} />
                {s.label}
                <span className="text-muted">（最新 {s.latest === null ? "圏外" : `${s.latest} 位`}）</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
    </div>
  );
}
