"use client";

/**
 * Google マップ検索順位の推移（毎週の報告書から）。自社店舗ごと。
 * 数字は各週の報告書（r29 の RankSection）にあるものをそのまま線にする。
 */
import { useEffect, useState } from "react";
import type { MapsRankHistoryResponse } from "@/app/api/maps/rank-history/route";
import { LineChart } from "@/components/charts";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

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

  return (
    <Card
      number={number}
      title="検索順位の推移（Google マップ検索）"
      description="対策キーワードで Google マップ検索したときの自社の順位を、毎週の一斉更新の報告書から並べます。上が 1 位。圏外（上位 20 件に無い）の週は線が切れます。"
      className="no-print"
    >
      {!placeId && <EmptyState title="自社の店舗を選んでください" description="店舗を選ぶと、その店舗の順位の推移を表示します。" />}
      {placeId && error && (
        <Callout tone="fail" title="推移を読み込めませんでした">
          {error}
        </Callout>
      )}
      {placeId && history && history.dates.length < 2 && (
        <EmptyState
          title="推移はまだ描けません"
          description={history.dates.length === 0 ? "「オーナー情報の入力」で対策キーワードを設定すると、毎週の一斉更新で順位を記録します。" : "2 週分以上の記録がたまると線になります（次回の一斉更新は毎週月曜 5:00）。"}
        />
      )}
      {placeId && history && history.dates.length >= 2 && (
        <LineChart
          labels={history.dates}
          series={shown.map((s) => ({ id: s.keyword, label: s.keyword, values: s.points.map((p) => p.rank) }))}
          invert
          yMin={1}
          yMax={history.limit}
          format={(v) => (v === null ? "圏外" : `${v} 位`)}
          nullLabel="圏外"
          ariaLabel={`${storeName ?? "自社"} の Google マップ検索順位の推移（${history.dates[0]}〜${history.dates[history.dates.length - 1]}）`}
          height={240}
        />
      )}
    </Card>
  );
}
