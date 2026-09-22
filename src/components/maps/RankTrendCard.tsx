"use client";

/**
 * Google マップ検索順位の推移（毎週の報告書から）。自社店舗ごと。
 * 数字は各週の報告書（r29 の RankSection）にあるものをそのまま線にする。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにして、デモデータを入れて、
 * 最初からこう表示されると分かるように」。**2 週ぶんたまるまでは破線のイメージ**を描く
 * （以前はここで空の画面を出していた）。実線 = 実測、破線 = 実測ではない、は崩さない。
 */
import { useEffect, useState } from "react";
import type { MapsRankHistoryResponse } from "@/app/api/maps/rank-history/route";
import { LineChart, SampleBadge, SampleChart } from "@/components/charts";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { dayLabel } from "@/lib/demo/dates";
import { sampleMapRankTrend } from "@/lib/demo/meo";

/** マップ検索で見る上位の件数（実測が無いときの縦軸の下端） */
const SAMPLE_LIMIT = 20;

export interface RankTrendCardProps {
  number: number;
  placeId: string | null;
  storeName: string | null;
  /** 変わると読み直す（履歴が増えたとき） */
  refreshKey: number;
}

export function RankTrendCard({ number, placeId, storeName, refreshKey }: RankTrendCardProps) {
  // 店舗ごとに持つ（店舗を切り替えた直後に前の店舗の線を出さない）
  const [data, setData] = useState<{ placeId: string; body: MapsRankHistoryResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!placeId) return;
    const ac = new AbortController();
    fetch(`/api/maps/rank-history?placeId=${encodeURIComponent(placeId)}`, { cache: "no-store", signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})) as { error?: string }).error ?? `HTTP ${r.status}`);
        return (await r.json()) as MapsRankHistoryResponse;
      })
      .then((body) => {
        setData({ placeId, body });
        setError(null);
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : "推移を読み込めませんでした");
      });
    return () => ac.abort();
  }, [placeId, refreshKey]);

  const history = placeId && data?.placeId === placeId ? data.body.history : null;
  const shown = history ? history.series.slice(0, 6) : [];
  // 点が 1 つ以下では線にならない。空の画面を出さず、これからの見え方を破線で見せる
  const showSample = Boolean(placeId) && !error && (history === null || history.dates.length < 2);

  return (
    <Card
      number={number}
      title="検索順位の推移（Google マップ検索）"
      description="対策キーワードで Google マップ検索したときの自社の順位を、毎週の一斉更新の報告書から並べます。上が 1 位。圏外（上位 20 件に無い）の週は線が切れます。"
      className="no-print"
      actions={showSample ? <SampleBadge /> : undefined}
    >
      {!placeId && <EmptyState title="自社の店舗を選んでください" description="店舗を選ぶと、その店舗の順位の推移を表示します。" />}
      {placeId && error && (
        <Callout tone="fail" title="推移を読み込めませんでした">
          {error}
        </Callout>
      )}
      {showSample && <RankTrendSample keywords={history ? history.series.map((s) => s.keyword) : []} measured={history?.dates.length ?? 0} />}
      {placeId && history && history.dates.length >= 2 && (
        <LineChart
          labels={history.dates.map(dayLabel)}
          series={shown.map((s) => ({ id: s.keyword, label: s.keyword, values: s.points.map((p) => p.rank) }))}
          invert
          yMin={1}
          yMax={history.limit}
          format={(v) => (v === null ? "圏外" : `${v} 位`)}
          nullLabel="圏外"
          xHeader="計測日"
          ariaLabel={`${storeName ?? "自社"} の Google マップ検索順位の推移（${history.dates[0]}〜${history.dates[history.dates.length - 1]}）`}
          height={240}
        />
      )}
    </Card>
  );
}

/* ───────────── 計測前のイメージ（破線） ───────────── */

function RankTrendSample({ keywords, measured }: { keywords: readonly string[]; measured: number }) {
  const { dates, series } = sampleMapRankTrend(keywords);
  const registered = keywords.length > 0;
  return (
    <SampleChart
      lead={
        <>
          {measured === 0 ? "まだ順位の記録がありません。" : "記録は 1 週ぶんだけです。線としてつながるのは 2 週目からです。"}
          {registered
            ? "破線は、登録済みの対策キーワードで「計測が進むとこう見える」を描いたものです。"
            : "「オーナー情報の入力」で対策キーワードを設定すると、毎週の一斉更新でこの形の実線がたまっていきます。"}
        </>
      }
      note={
        <>
          上が 1 位です。毎週月曜 5:00 の一斉更新で 1 点ずつ増え、
          <strong className="font-bold">2 週目から線としてつながります</strong>。
          上位 {SAMPLE_LIMIT} 件に入っていない週は「圏外」として線が切れます（最下位として描きません）。
        </>
      }
    >
      <LineChart
        labels={dates.map(dayLabel)}
        series={series.map((s) => ({ id: s.id, label: s.label, values: s.values, dashed: true }))}
        invert
        yMin={1}
        yMax={SAMPLE_LIMIT}
        format={(v) => (v === null ? "圏外" : `${v} 位`)}
        nullLabel="圏外"
        xHeader="計測日（月曜）"
        ariaLabel={`計測を始めたあとの見え方のイメージ（実測ではありません）。縦軸は Google マップ検索の順位、横軸はこれからの ${dates.length} 週`}
        height={240}
      />
    </SampleChart>
  );
}
