"use client";

/**
 * 口コミの状況（集計）。返信タブの一覧の前に置く。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください。デモデータを入れて、
 * 最初からグラフがこう表示される・データがこう集計されると直感的に分かるように。
 * MEO は抜け漏れがないようにタブごとに」。
 *
 * 返信タブは口コミが縦に並ぶだけで、**「何件のうち何件に返せているか」「低評価が何件か」**が
 * 分からなかった。ここで 2 つの図にする:
 *   ①返信の状況（返信済み / 未返信の 1 本の帯）… この機能でやるべき仕事の残り
 *   ②評価の分布（★5〜★1 の棒）… 先に返すべき低評価がどれだけあるか
 *
 * 口コミと返信は Google が持つ数字なので、ここでも保存しない（画面で数えるだけ）。
 */
import { Histogram, SampleBadge, SampleChart, SegmentBar } from "@/components/charts";
import { Card } from "@/components/ui/Card";
import { StatStrip } from "@/components/ui/StatCard";
import { SAMPLE_REPLY_MIX } from "@/lib/demo/meo";
import { palette } from "@/lib/ui/palette";
import type { ReviewRow } from "./RepliesTool";

export interface ReviewMixCardProps {
  number: number;
  rows: readonly ReviewRow[];
  /** Google が返した全体の件数（一覧は分割で届くので、全体はこちらを使う） */
  total: number | null;
  averageRating: number | null;
  /** Google ビジネス プロフィールに接続済み（未接続なら公開情報の最新 5 件しか無い） */
  connected: boolean;
}

export interface ReviewMix {
  replied: number;
  pending: number;
  /** 1〜5 の件数 */
  distribution: [number, number, number, number, number];
  /** 低評価（★1・★2）の件数 */
  low: number;
}

/** 一覧 → 集計（純粋関数・テスト対象） */
export function summarizeReviews(rows: readonly ReviewRow[]): ReviewMix {
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  let replied = 0;
  for (const r of rows) {
    if (r.reply) replied += 1;
    if (r.rating !== null && r.rating >= 1 && r.rating <= 5) distribution[r.rating - 1] += 1;
  }
  return { replied, pending: rows.length - replied, distribution, low: distribution[0] + distribution[1] };
}

/** 1〜5 の件数 → 棒グラフの区分（★5 が左）。低評価だけ色を変える */
export function ratingBands(distribution: readonly number[]) {
  return [5, 4, 3, 2, 1].map((n) => ({
    label: `★${n}`,
    count: distribution[n - 1] ?? 0,
    color: n <= 2 ? palette.chart[3] : palette.chart[0],
  }));
}

function ReplyBar({ replied, pending }: { replied: number; pending: number }) {
  return (
    <SegmentBar
      segments={[
        { label: "返信済み", value: replied, color: palette.chart[0] },
        { label: "未返信", value: pending, color: palette.chart[3] },
      ]}
      ariaLabel={`返信済み ${replied} 件、未返信 ${pending} 件`}
    />
  );
}

export function ReviewMixCard({ number, rows, total, averageRating, connected }: ReviewMixCardProps) {
  const mix = summarizeReviews(rows);
  const counted = rows.length;
  const rate = counted === 0 ? null : Math.round((mix.replied / counted) * 1000) / 10;

  if (counted === 0) {
    return (
      <Card number={number} title="口コミの状況" description="返信できている割合と、評価の分布をグラフにします。" actions={<SampleBadge label="イメージ（まだ口コミがありません）" />}>
        <ReviewMixSample connected={connected} />
      </Card>
    );
  }

  return (
    <Card
      number={number}
      title="口コミの状況"
      description={
        connected
          ? `いま読み込んでいる ${counted.toLocaleString("ja-JP")} 件で数えています。「さらに読み込む」を押すと、この集計も増えます。`
          : "接続前は、Google マップの公開情報で取れる最新 5 件だけを数えています。全件を見るには Google ビジネス プロフィールの接続が要ります。"
      }
    >
      <StatStrip
        items={[
          { label: "口コミ（全体）", value: (total ?? counted).toLocaleString("ja-JP"), unit: "件" },
          { label: "平均評価", value: averageRating === null ? "–" : averageRating.toFixed(1), unit: "/ 5" },
          { label: "未返信", value: mix.pending.toLocaleString("ja-JP"), unit: `件（読み込み済み ${counted} 件のうち）` },
          { label: "返信できている割合", value: rate === null ? "–" : `${rate}%`, unit: `（${mix.replied} 件）` },
          { label: "低評価（★1・★2）", value: mix.low.toLocaleString("ja-JP"), unit: "件" },
        ]}
      />

      <h3 className="mt-6 text-sm font-bold text-ink">返信の状況</h3>
      <ReplyBar replied={mix.replied} pending={mix.pending} />
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        Google は「口コミに返信している店舗」を評価します。
        <strong className="font-bold">未返信をゼロに近づけること</strong>が、この画面でやることです。
      </p>

      <h3 className="mt-6 text-sm font-bold text-ink">評価の分布</h3>
      <Histogram className="mt-2" bands={ratingBands(mix.distribution)} ariaLabel="評価ごとの口コミ件数" />
      <p className="mt-1 text-[11px] text-muted">色の濃い棒（★1・★2）から先に返信してください。低評価への返信は、読んでいる他のお客様に向けた説明にもなります。</p>
    </Card>
  );
}

/* ───────────── 口コミが入る前のイメージ（淡い色） ───────────── */

function ReviewMixSample({ connected }: { connected: boolean }) {
  return (
    <SampleChart
      lead={
        connected
          ? "このビジネスにはまだ口コミがありません。口コミが付くと、この形の集計に置き換わります。"
          : "まだ口コミを読み込めていません。Google ビジネス プロフィールを接続すると全件、接続前でも MEO に登録した店舗の公開情報から最新 5 件をここで数えます。"
      }
      note={
        <>
          左の図は「読み込んだ口コミのうち、何件に返信できているか」です。
          <strong className="font-bold">未返信（濃い色）をゼロに近づける</strong>のがこの画面の仕事です。
          右の図は評価の分布で、★1・★2 から先に返信します。
        </>
      }
    >
      <div className="grid gap-5 @2xl:grid-cols-2">
        <div>
          <h3 className="text-sm font-bold text-ink">返信の状況（イメージ）</h3>
          <div className="mt-2">
            <ReplyBar replied={SAMPLE_REPLY_MIX.replied} pending={SAMPLE_REPLY_MIX.pending} />
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">評価の分布（イメージ）</h3>
          <Histogram className="mt-2" bands={ratingBands(SAMPLE_REPLY_MIX.distribution)} ariaLabel="口コミが付いたあとの見え方のイメージ（実測ではありません）" />
        </div>
      </div>
    </SampleChart>
  );
}
