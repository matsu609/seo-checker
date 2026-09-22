"use client";

/**
 * 順位の推移（折れ線）。手動計測と毎週の自動計測の履歴を同じ線に並べる。
 *
 * 系列は多すぎると読めないので、最初は最新順位が良い順に 4 語を出し、チェックで最大 6 語まで選べる
 * （色は 6 色を固定順で使い、循環させない）。
 *
 * **まだ 2 回計測していないときは、空のままにせず破線のイメージを描く**
 * （利用者の指示 2026-09-22「最初のうちはデータがないので、デモデータの破線グラフで」）。
 * 破線 = 実測ではない、の区別は崩さない。AI 検索モニタリング（r149）と同じ見せ方。
 */
import { useMemo, useState } from "react";
import { LineChart, type LineSeries } from "@/components/charts";
import { Callout } from "@/components/ui";
import { storedDates } from "@/lib/rank/classify";
import { comingMeasureDates, sampleRankSeries, sampleYMax, SAMPLE_POINTS } from "@/lib/rank/sample";
import { DEVICE_LABELS, type RankKeyword, type RankSnapshot } from "@/lib/rank/store";
import { MAX_RANK } from "@/lib/rank/types";

/** 目盛りの短い表記（2026-09-22 → 9/22） */
export function dateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : iso;
}

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

  // 点が 1 つ以下では線にならない。空の画面を出さず、これからの見え方を破線で見せる
  if (labels.length < 2) {
    return <SamplePreview keywords={keywords} measured={labels.length} />;
  }

  return (
    <div className="space-y-4">
      <LineChart
        labels={labels.map(dateLabel)}
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

/* ───────────── 計測前のイメージ（破線） ───────────── */

function SamplePreview({ keywords, measured }: { keywords: readonly RankKeyword[]; measured: number }) {
  const dates = comingMeasureDates();
  const registered = keywords.map((k) => k.keyword).filter(Boolean);
  const series = sampleRankSeries(registered);
  const lines: LineSeries[] = series.map((s) => ({
    id: s.id,
    label: s.label,
    values: s.values,
    dashed: true,
  }));

  return (
    <div className="space-y-4">
      <Callout tone="info" title="これは実測ではなく、グラフのイメージです">
        <p className="leading-relaxed">
          {measured === 0
            ? "まだ 1 回も計測していません。"
            : "計測は 1 回ぶんだけです。線としてつながるのは 2 回目からです。"}
          {registered.length > 0
            ? "破線は、登録済みのキーワードで「計測が進むとこう見える」を描いたものです。"
            : "キーワードを登録して計測すると、ここに実線のグラフが出ます。"}
        </p>
      </Callout>

      <LineChart
        labels={dates.map(dateLabel)}
        series={lines}
        invert
        yMin={1}
        yMax={sampleYMax(series)}
        format={(v) => (v === null ? "圏外" : `${v} 位`)}
        nullLabel="圏外 / 未取得"
        xHeader="計測日（火曜）"
        ariaLabel={`計測を始めたあとの見え方のイメージ（実測ではありません）。縦軸は検索順位、横軸はこれからの ${SAMPLE_POINTS} 回`}
        height={260}
      />

      <p className="text-[11px] leading-relaxed text-muted">
        <strong className="font-bold">破線はイメージで、実際に測った順位ではありません。</strong>
        計測が始まると、この形の<strong className="font-bold">実線</strong>に置き換わります。上が 1 位です。
        1 点目が入るのは<strong className="font-bold">最初の計測の直後</strong>、線としてつながるのは 2 回目からで、
        毎週火曜 5:00 の自動計測でたまっていきます。いますぐ見たいときは「リアルタイム計測」で 1 点目を作れます。
      </p>
    </div>
  );
}
