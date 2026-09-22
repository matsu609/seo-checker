"use client";

/**
 * 競合との比較を横棒グラフにしたもの（表の前に置く）。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください。デモデータを入れて、
 * 最初からこう表示される・こう集計されると直感的に分かるように」。
 *
 * 表は 11 列あって「自社が何番目か」が一目で分からないので、**まず順位が見える棒**を出し、
 * 細かい内訳は下の表に任せる。競合をまだ登録していないときは、薄い色の見本を描く
 * （ここだけは線ではなく棒なので、破線の代わりに**淡い色 + 「例:」の名前**で実測と分ける）。
 */
import type { MapsCompareItem } from "@/app/api/maps/compare/route";
import { HBar, SampleChart, type HBarRow } from "@/components/charts";
import { sampleCompare } from "@/lib/demo/meo";
import { palette } from "@/lib/ui/palette";

/** 棒に出す最大件数（自社 + 競合 5 件） */
const MAX_ROWS = 6;

export interface CompareChartProps {
  results: readonly MapsCompareItem[];
  ownName: string | null;
}

/** 比較の行 → 棒の行（純粋関数・テスト対象）。採点できていない店舗は外す */
export function toCompareRows(results: readonly MapsCompareItem[]): HBarRow[] {
  return [...results]
    .filter((r) => r.score.score !== null)
    .sort((a, b) => (b.score.score ?? 0) - (a.score.score ?? 0))
    .slice(0, MAX_ROWS)
    .map((r) => ({
      label: r.role === "own" ? `${r.detail.name}（自社）` : r.detail.name,
      value: r.score.score ?? 0,
      sublabel: `評価 ${r.detail.rating?.toFixed(1) ?? "—"} ・ 口コミ ${r.detail.ratingCount?.toLocaleString("ja-JP") ?? "—"} 件 ・ 写真 ${r.detail.photoCount} 枚`,
      // 自社だけアクセント、競合は落ち着いた色（色だけに頼らず名前にも「（自社）」を付ける）
      color: r.role === "own" ? palette.chart[0] : palette.chart[4],
    }));
}

export function CompareChart({ results, ownName }: CompareChartProps) {
  const rows = toCompareRows(results);
  // 自社 1 件だけでは「比較」にならない。何が出るのかを見本で見せる
  if (rows.length < 2) return <CompareSample ownName={ownName} measured={rows.length} />;

  return (
    <div className="space-y-2">
      <HBar
        rows={rows}
        max={100}
        ticks={[50, 80]}
        valueTone="score"
        labelWidth="12rem"
        legend={false}
        ariaLabel="自社と競合のプロフィール充実度（100 点満点）"
      />
      <p className="text-[11px] leading-relaxed text-muted">
        棒は「プロフィールの充実度」（100 点満点）です。評価の星の数ではなく、
        <strong className="font-bold">基本情報・投稿・写真・レビューがどれだけ埋まっているか</strong>を採点しています。ここは自分で埋められる数字です。
      </p>
    </div>
  );
}

/* ───────────── 競合を登録する前のイメージ（淡い色） ───────────── */

function CompareSample({ ownName, measured }: { ownName: string | null; measured: number }) {
  const rows: HBarRow[] = sampleCompare(ownName).map((r) => ({
    label: r.label,
    value: r.score,
    color: r.own ? palette.chart[0] : palette.chartTrack,
  }));

  return (
    <SampleChart
      lead={
        measured === 0
          ? "まだ採点できた店舗がありません。上の検索から自社と競合を登録すると、この形の棒が出ます。"
          : "競合をまだ登録していません。上の検索から「競合として登録」を押すと、自社と並べた棒がここに出ます（最大 5 件）。"
      }
      note={
        <>
          棒は「プロフィールの充実度」（100 点満点）で、毎週月曜 5:00 の一斉更新で描き直します。
          自社が何番目かと、<strong className="font-bold">どれだけ差があるか</strong>を一目で見るための図です。
        </>
      }
    >
      <HBar rows={rows} max={100} ticks={[50, 80]} valueTone="none" labelWidth="12rem" legend={false} ariaLabel="競合を登録したあとの見え方のイメージ（実測ではありません）" />
    </SampleChart>
  );
}
