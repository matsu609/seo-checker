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
 */
import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { LineChart, type LineSeries } from "@/components/charts";
import type { WeeklySeries } from "@/lib/geo/aggregate";

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

export function TrendChart({ weeks, series, title, description, emptyText, unit }: TrendChartProps) {
  const [selected, setSelected] = useState<string[]>(() => defaultSelection(series));

  const shown = series.filter((s) => selected.includes(s.targetId));
  const lines: LineSeries[] = shown.map((s) => ({
    id: s.targetId,
    label: s.label,
    // 観測の無い週は null のまま（0% にしない）
    values: s.points.map((p) => (p.rate === null ? null : Math.round(p.rate * 1000) / 10)),
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
        series.length > 0 && (
          <Badge tone="neutral" icon={false}>
            {selected.length} / {Math.min(series.length, MAX_SERIES)} 本
          </Badge>
        )
      }
    >
      {series.length === 0 ? (
        <p className="text-[13px] text-muted">{emptyText}</p>
      ) : (
        <>
          {lines.length === 0 ? (
            <p className="text-[13px] text-muted">下のボタンで、見たい{unit}を選んでください。</p>
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

          <div className="mt-4">
            <p className="mb-2 text-[11px] text-muted">
              表示する{unit}（最大 {MAX_SERIES} 本{full ? "。外してから選び直してください" : ""}）
            </p>
            <ul className="flex flex-wrap gap-2">
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
          </div>

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
