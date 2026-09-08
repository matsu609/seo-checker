"use client";

/**
 * 検索パフォーマンス（Search Console）。
 *
 * 対象サイトは設定画面で選んだもの。ここでは期間だけを選び、
 * POST /api/search-performance の結果を表示する。
 */
import Link from "next/link";
import { useState } from "react";
import { Sparkline } from "@/components/charts";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import type { SearchPerformanceResponse } from "@/app/api/search-performance/route";
import type { SearchAnalyticsRow } from "@/lib/google/search-console/types";
import { changeRate, formatCtr, formatInt, formatPosition, shortenUrl } from "./format";

const PERIODS = [
  { days: 7, label: "7 日" },
  { days: 28, label: "28 日" },
  { days: 90, label: "90 日" },
  { days: 180, label: "180 日" },
  { days: 365, label: "365 日" },
] as const;

type TabId = "queries" | "pages";

export interface SearchPerformanceViewProps {
  /** 設定画面で選ばれているサイト。未選択なら null */
  siteUrl: string | null;
  /** Google アカウントを接続済みか */
  connected: boolean;
}

export function SearchPerformanceView({ siteUrl, connected }: SearchPerformanceViewProps) {
  const [days, setDays] = useState<number>(28);
  const [data, setData] = useState<SearchPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("queries");

  async function run(nextDays = days, refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search-performance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: nextDays, refresh }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `取得できませんでした（HTTP ${res.status}）`);
      setData(body as SearchPerformanceResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得できませんでした");
    } finally {
      setLoading(false);
    }
  }

  if (!connected || !siteUrl) {
    return (
      <Callout tone="info" title="Search Console が連携されていません">
        <p>
          {connected
            ? "見る対象のサイトが選ばれていません。"
            : "Google アカウントが接続されていません。"}
          設定画面から接続と対象サイトの選択を行ってください。
        </p>
        <p className="mt-2">
          <Link href="/settings" className="text-accent underline">
            設定画面を開く
          </Link>
        </p>
      </Callout>
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="期間"
        description={`対象サイト: ${siteUrl}`}
        actions={
          data && (
            <Button variant="ghost" size="sm" onClick={() => void run(days, true)} disabled={loading}>
              最新に更新
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant={p.days === days ? "primary" : "ghost"}
              disabled={loading}
              onClick={() => {
                setDays(p.days);
                void run(p.days);
              }}
            >
              {p.label}
            </Button>
          ))}
          {!data && (
            <Button size="sm" disabled={loading} onClick={() => void run()}>
              {loading ? "取得中…" : "取得する"}
            </Button>
          )}
        </div>
        {data && (
          <p className="mt-2 text-[12px] text-muted">
            {data.range.startDate} 〜 {data.range.endDate}（前期間 {data.previous.startDate} 〜{" "}
            {data.previous.endDate}）。Search Console はデータの確定に数日かかるため、終了日は{" "}
            {data.lagDays} 日前です。
          </p>
        )}
      </Card>

      {error && (
        <Callout tone="fail" title="取得できませんでした">
          {error}
        </Callout>
      )}

      {data && <Summary data={data} />}
      {data && (
        <Card title="上位の内訳">
          <Tabs
            tabs={[
              { id: "queries", label: "クエリ", count: data.queries.length },
              { id: "pages", label: "ページ", count: data.pages.length },
            ]}
            value={tab}
            onChange={(id) => setTab(id as TabId)}
            ariaLabel="内訳の種類"
            className="mb-3"
          />
          {tab === "queries" ? (
            <DataTable
              rows={data.queries}
              columns={rowColumns("クエリ", (r) => r.keys[0] ?? "")}
              rowKey={(r, i) => `${r.keys[0] ?? ""}-${i}`}
              defaultSort={{ key: "clicks", dir: "desc" }}
              emptyText="この期間に表示されたクエリがありません。"
              minWidth="34rem"
              dense
            />
          ) : (
            <DataTable
              rows={data.pages}
              columns={rowColumns("ページ", (r) => shortenUrl(r.keys[0] ?? ""), (r) => r.keys[0] ?? "")}
              rowKey={(r, i) => `${r.keys[0] ?? ""}-${i}`}
              defaultSort={{ key: "clicks", dir: "desc" }}
              emptyText="この期間に表示されたページがありません。"
              minWidth="34rem"
              dense
            />
          )}
        </Card>
      )}

      {!data && !loading && !error && (
        <EmptyState
          title="まだ取得していません"
          description="期間を選ぶと、Search Console から実測値を取得します。"
        />
      )}
    </div>
  );
}

/** KPI と日別の推移 */
function Summary({ data }: { data: SearchPerformanceResponse }) {
  const { totals, previousTotals, daily } = data;
  const rate = (c: number, p: number) => {
    const r = changeRate(c, p);
    return r === null ? undefined : { value: Number(r.toFixed(1)), unit: "%", label: "前期比" };
  };
  return (
    <Card title="サマリー">
      <div className="grid gap-3 @md:grid-cols-4">
        <StatCard label="クリック数" value={formatInt(totals.clicks)} delta={rate(totals.clicks, previousTotals.clicks)} />
        <StatCard
          label="表示回数"
          value={formatInt(totals.impressions)}
          delta={rate(totals.impressions, previousTotals.impressions)}
        />
        <StatCard label="CTR" value={formatCtr(totals.ctr)} delta={rate(totals.ctr, previousTotals.ctr)} />
        <StatCard
          label="平均掲載順位"
          value={formatPosition(totals.position)}
          // 掲載順位は小さいほど良い
          delta={
            previousTotals.position > 0
              ? {
                  value: Number((totals.position - previousTotals.position).toFixed(1)),
                  positiveIsGood: false,
                  label: "前期比",
                }
              : undefined
          }
          hint="1 に近いほど上位"
        />
      </div>
      {daily.length > 1 && (
        <div className="mt-4">
          <p className="text-[12px] font-bold text-muted">日別のクリック数</p>
          <Sparkline
            values={daily.map((d) => d.clicks)}
            width={640}
            height={56}
            className="mt-1 h-auto w-full max-w-full"
            ariaLabel={`日別のクリック数（${daily.length} 日分）`}
          />
        </div>
      )}
    </Card>
  );
}

/** クエリ / ページで共通の列 */
function rowColumns(
  header: string,
  label: (row: SearchAnalyticsRow) => string,
  title?: (row: SearchAnalyticsRow) => string,
): Column<SearchAnalyticsRow>[] {
  return [
    {
      key: "key",
      header,
      accessor: (r) => label(r),
      render: (r) => (
        <span className="block max-w-[22rem] truncate" title={title?.(r) ?? label(r)}>
          {label(r) || "（不明）"}
        </span>
      ),
    },
    { key: "clicks", header: "クリック", align: "right", sortable: true, accessor: (r) => r.clicks, render: (r) => formatInt(r.clicks) },
    { key: "impressions", header: "表示回数", align: "right", sortable: true, accessor: (r) => r.impressions, render: (r) => formatInt(r.impressions) },
    { key: "ctr", header: "CTR", align: "right", sortable: true, accessor: (r) => r.ctr, render: (r) => formatCtr(r.ctr) },
    { key: "position", header: "平均順位", align: "right", sortable: true, accessor: (r) => r.position, render: (r) => formatPosition(r.position) },
  ];
}
