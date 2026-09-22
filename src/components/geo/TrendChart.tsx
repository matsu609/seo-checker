"use client";

/**
 * キーワード（プロンプト）ごとの推移（利用者の指示 2026-09-21
 * 「グラフでキーワードごとに順位を追うような、折れ線グラフで表示されるようにしたい」）。
 *
 * x = 週（月曜始まり）、y = その週の出現率、1 本の線 = キーワード 1 語 / プロンプト 1 本。
 * 描画は既存の `LineChart`（十字線・キーボード操作・凡例・点の形・表を持っている）に任せ、
 * ここは「どの線を出すか」と説明だけを受け持つ。
 *
 * 守ること:
 * - **観測の無い週は null のまま渡す**（0% と区別する）。LineChart が線を切るので、
 *   計測が止まっただけの週を「急落」と読ませない。
 * - 線は最大 6 本（LineChart の色と点の形が 6 種類）。既定は直近の率が高い順に 5 本。
 * - 1 週ぶんの率は n が小さく上下が大きいので、図の下でそれを断る。
 * - **まだ 1 件も計測していないときは、4 週分の「イメージ」を破線で見せる**
 *   （利用者の指示 2026-09-21）。計測を始める前に「こんな数字が取れます」を
 *   掴んでもらうため。**実線 = 実測、破線 = イメージ**を崩さず、見出し・帯・
 *   凡例・図の下の 3 か所で「実測ではない」と書く。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card } from "@/components/ui";
import { LineChart, type LineSeries } from "@/components/charts";
import { comingWeekStarts, sampleSeries, SAMPLE_WEEKS, type WeeklySeries } from "@/lib/geo/aggregate";

/** 同時に描ける線の本数（LineChart の色 / 点の形の数） */
export const MAX_SERIES = 6;
/** 最初から選んでおく本数 */
const DEFAULT_SERIES = 5;

export interface TrendChartProps {
  weeks: readonly string[];
  series: readonly WeeklySeries[];
  title: string;
  description: string;
  emptyText: string;
  /** 「キーワード」か「プロンプト」。文面に使う */
  unit: string;
  /**
   * まだ計測が無いときに見せるイメージの線に使う言葉（登録済みのキーワード / プロンプト）。
   * 空なら一般的な例に置き換える。
   */
  sampleLabels?: readonly string[];
}

/** 週初（2026-09-21）→ 目盛りの短い表記（9/21） */
export function weekLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${Number(m)}/${Number(d)}` : iso;
}

/** 既定で選ぶ対象（直近の率が高い順。サーバーが既に並べてある） */
export function defaultSelection(series: readonly WeeklySeries[], max = DEFAULT_SERIES): string[] {
  return series.slice(0, max).map((s) => s.targetId);
}

export function TrendChart({ weeks, series, title, description, emptyText, unit, sampleLabels }: TrendChartProps) {
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(series));

  const shown = series.filter((s) => selected.includes(s.targetId));
  const lines: LineSeries[] = shown.map((s, i) => ({
    id: s.targetId,
    label: s.label,
    // 観測の無い週は null のまま（0% にしない）
    values: s.points.map((p) => (p.rate === null ? null : Math.round(p.rate * 1000) / 10)),
    // 主役 1 本だけ下を塗る（全部塗ると重なって読めない）
    fill: i === 0,
  }));

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SERIES) return prev;
      return [...prev, id];
    });
  };

  const full = selected.length >= MAX_SERIES;
  const gaps = shown.some((s) => s.points.some((p) => p.rate === null));

  return (
    <Card
      title={title}
      description={description}
      printCard
      actions={
        series.length > 0 ? (
          <Badge tone="neutral" icon={false}>
            {selected.length} / {Math.min(series.length, MAX_SERIES)} 本
          </Badge>
        ) : (
          <Badge tone="info" icon={false}>
            イメージ（まだ計測していません）
          </Badge>
        )
      }
    >
      {series.length === 0 ? (
        <SamplePreview emptyText={emptyText} unit={unit} labels={sampleLabels ?? []} />
      ) : (
        <>
          {/* 凡例チップ。グラフの上に置いて、選び直しと凡例を 1 か所にまとめる */}
          <ul className="mb-3 flex flex-wrap gap-2">
            {series.map((s) => {
              const on = selected.includes(s.targetId);
              return (
                <li key={s.targetId}>
                  <Button
                    size="sm"
                    variant={on ? "primary" : "secondary"}
                    disabled={!on && full}
                    onClick={() => toggle(s.targetId)}
                    aria-pressed={on}
                  >
                    {s.label}
                    <span className="ml-1 text-[11px] opacity-70">{s.latest === null ? "未計測" : `${Math.round(s.latest * 100)}%`}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
          {lines.length === 0 ? (
            <p className="text-[13px] text-muted">上のボタンで、見たい{unit}を選んでください。</p>
          ) : (
            <LineChart
              labels={weeks.map(weekLabel)}
              series={lines}
              yMin={0}
              yMax={100}
              yTicks={[0, 25, 50, 75, 100]}
              height={260}
              format={(v) => (v === null ? "—" : `${Math.round(v)}%`)}
              nullLabel="未計測"
              xHeader="週（月曜）"
              ariaLabel={title}
            />
          )}

          <p className="mt-4 text-[11px] leading-relaxed text-muted">
            1 点は<strong className="font-bold">その週だけ</strong>の出現率です。1 週ぶんは回数が少なく上下が大きいので、
            <strong className="font-bold">傾きを見るためのグラフ</strong>として使ってください。いまの水準と、その確からしさ（幅）は上の棒グラフで見られます。
            {gaps && <> 線が切れているところは、その週に計測が無かった区間です（0% ではありません）。</>}
          </p>
        </>
      )}
    </Card>
  );
}

/* ───────────── 計測前のイメージ（破線） ───────────── */

/**
 * まだ 1 件も計測していないときに出す「こんな数字が取れます」の図。
 *
 * **実測と取り違えられないことが最優先**なので、次の 4 つを同時にやる:
 *   ①線を破線にする ②カードのバッジと図の上の帯で「イメージ」と言う
 *   ③系列名に「例:」を付ける（凡例にも表にも出る） ④図の下でもう一度断る
 * 横軸は**これからの 4 週**（過去の日付にすると「もう測った数字」に見えるため）。
 */
function SamplePreview({ emptyText, unit, labels }: { emptyText: string; unit: string; labels: readonly string[] }) {
  const weeks = comingWeekStarts(SAMPLE_WEEKS);
  const lines: LineSeries[] = sampleSeries(labels, weeks).map((s) => ({
    id: s.targetId,
    label: `例: ${s.label}`,
    values: s.points.map((p) => (p.rate === null ? null : Math.round(p.rate * 1000) / 10)),
    dashed: true,
  }));

  return (
    <>
      <Callout tone="info" title="これは実測ではなく、グラフのイメージです">
        <p className="leading-relaxed">{emptyText}</p>
      </Callout>

      <div className="mt-4">
        <LineChart
          labels={weeks.map(weekLabel)}
          series={lines}
          yMin={0}
          yMax={100}
          yTicks={[0, 25, 50, 75, 100]}
          height={260}
          format={(v) => (v === null ? "—" : `${Math.round(v)}%`)}
          nullLabel="—"
          xHeader="週（月曜）"
          ariaLabel={`計測を始めたあとの見え方のイメージ（実測ではありません）。縦軸は出現率、横軸はこれからの ${SAMPLE_WEEKS} 週`}
        />
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        <strong className="font-bold">破線はイメージで、実際に計測した値ではありません。</strong>
        計測が始まると、この形の<strong className="font-bold">実線</strong>に置き換わります。
        縦軸は出現率（{unit}が AI の回答に出た割合）、横軸は週です。
        1 本目の点が入るのは計測の翌朝、<strong className="font-bold">線としてつながるのは 2 週目から</strong>、
        数字が落ち着くまでは 4 週ほどかかります。
      </p>
    </>
  );
}
