"use client";

/**
 * 投稿の頻度（週ごとの本数）。投稿の一覧の前に置く。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください。デモデータを入れて、
 * 最初からグラフがこう表示される・データがこう集計されると直感的に分かるように。
 * MEO は抜け漏れがないようにタブごとに」。
 *
 * この画面の目的は「週 1 回の投稿を続けること」なので、**続けられているかどうか**を図にする。
 * 実績（投稿済み）は実線、これからの予約は破線で、同じ図に並べる。
 */
import { LineChart, SampleBadge, SampleChart, type LineSeries } from "@/components/charts";
import { Card } from "@/components/ui/Card";
import { StatStrip } from "@/components/ui/StatCard";
import { dayLabel } from "@/lib/demo/dates";
import { samplePostWeeks } from "@/lib/demo/meo";
import { IDEAL_PER_WEEK, weeklyCadence, weeksWithPost } from "@/lib/posts/cadence";
import type { GbpPost } from "@/lib/posts/types";
import { jstWeekStart } from "@/lib/time/jst";

export interface CadenceCardProps {
  number: number;
  posts: readonly GbpPost[];
  storeName: string | null;
}

export function CadenceCard({ number, posts, storeName }: CadenceCardProps) {
  const weeks = weeklyCadence(posts);
  const { covered, total } = weeksWithPost(weeks);
  const published = posts.filter((p) => p.status === "published").length;
  const scheduled = posts.filter((p) => p.status === "scheduled").length;

  if (published === 0 && scheduled === 0) {
    return (
      <Card number={number} title="投稿の頻度" description="週ごとの投稿の本数をグラフにします。" actions={<SampleBadge label="イメージ（まだ投稿がありません）" />}>
        <CadenceSample />
      </Card>
    );
  }

  const thisWeek = jstWeekStart(new Date());
  // 実績は今週まで、予約は今週から先（同じ週で両方が重ならないよう、値の無いほうは null にする）
  const series: LineSeries[] = [
    { id: "published", label: "投稿済み", values: weeks.map((w) => (w.weekStart <= thisWeek ? w.published : null)), fill: true },
    { id: "scheduled", label: "予約済み（これから）", values: weeks.map((w) => (w.weekStart >= thisWeek ? w.scheduled : null)), dashed: true },
  ];

  return (
    <Card
      number={number}
      title={`投稿の頻度${storeName ? `（${storeName}）` : ""}`}
      description="週ごとの本数です。実線は投稿できた実績、破線はこれからの予約です。Google マップでは週 1 回の投稿を続けている店舗が評価されます。"
    >
      <StatStrip
        items={[
          { label: "投稿できた週", value: `${covered} / ${total}`, unit: "週" },
          { label: "投稿済み", value: published.toLocaleString("ja-JP"), unit: "本" },
          { label: "これからの予約", value: scheduled.toLocaleString("ja-JP"), unit: "本" },
        ]}
      />
      <LineChart
        className="mt-4"
        labels={weeks.map((w) => dayLabel(w.weekStart))}
        series={series}
        yMin={0}
        height={200}
        format={(v) => (v === null ? "—" : `${Math.round(v)} 本`)}
        nullLabel="—"
        xHeader="週（月曜から）"
        ariaLabel="週ごとの投稿の本数（実績と予約）"
      />
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        本数が 0 の週は「投稿できなかった週」です。理想は毎週 {IDEAL_PER_WEEK} 本以上で、
        先の週が 0 本のままなら「AI で下書きを作る」で 4 週分まとめて予約しておけます。
      </p>
    </Card>
  );
}

/* ───────────── 投稿が入る前のイメージ（破線） ───────────── */

function CadenceSample() {
  const { weeks, published } = samplePostWeeks();
  return (
    <SampleChart
      lead="まだ投稿がありません。「AI で下書きを作る」で 4 週分の下書きを作り、承認して予約すると、この形の実線に置き換わります。"
      note={
        <>
          横軸は週（月曜から）、縦軸はその週に投稿した本数です。
          毎日 5:00 の定期処理が、予定時刻を過ぎた予約を Google に送り、送れた分が実線になります。
          理想は<strong className="font-bold">毎週 {IDEAL_PER_WEEK} 本以上を続けること</strong>です。
        </>
      }
    >
      <LineChart
        labels={weeks.map(dayLabel)}
        series={[{ id: "sample-published", label: "投稿済み", values: published, dashed: true }]}
        yMin={0}
        yMax={3}
        yTicks={[0, 1, 2, 3]}
        height={200}
        format={(v) => (v === null ? "—" : `${Math.round(v)} 本`)}
        xHeader="週（月曜から）"
        ariaLabel="投稿を続けたあとの見え方のイメージ（実測ではありません）。縦軸は週あたりの本数、横軸はこれからの 4 週"
      />
    </SampleChart>
  );
}
