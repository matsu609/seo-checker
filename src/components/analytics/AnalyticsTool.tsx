"use client";

/**
 * アクセス解析（自前の計測タグ）の画面。
 *
 * 上から「計測タグ（貼り付け用）」→「期間」→「サマリー（前期比）」→「日別」→「流入元」→「ページ」。
 * GA4 は使わない（利用者の決定 2026-09-17）。数字はすべて自前のタグが集めた実測で、推定ではない。
 * まだイベントが届いていなければ、ダミーを出さずにタグの貼り方だけを見せる。
 */
import { useCallback, useEffect, useState } from "react";
import { HBar, Sparkline } from "@/components/charts";
import { Button, Callout, Card, DataTable, EmptyState, StatCard, Tabs, type Column, type StatDelta, type TabItem } from "@/components/ui";
import { CHANNEL_LABELS, CONVERSION_LABELS, type AnalyticsPayload, type ChannelStat, type ConversionKind, type DailyPoint, type PageStat, type SourceStat, type Totals } from "@/lib/analytics/types";
import { useToolRun } from "@/lib/tools/run";

type Days = 7 | 28 | 90;

const DAY_TABS: readonly TabItem<"7" | "28" | "90">[] = [
  { id: "7", label: "7 日" },
  { id: "28", label: "28 日" },
  { id: "90", label: "90 日" },
];

function num(value: number): string {
  return value.toLocaleString("ja-JP");
}

function secondsText(value: number | null): string {
  if (value === null) return "—";
  const m = Math.floor(value / 60);
  const s = value % 60;
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function delta(current: number, previous: number, positiveIsGood = true): StatDelta | undefined {
  if (previous === 0 && current === 0) return undefined;
  return { value: current - previous, positiveIsGood, label: "前の期間との差" };
}

function conversionsTotal(t: Totals): number {
  return (Object.keys(t.conversions) as ConversionKind[]).reduce((sum, k) => sum + t.conversions[k], 0);
}

function relativeTime(iso: string | null): string {
  if (!iso) return "まだ届いていません";
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "不明";
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes} 分前`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 時間前`;
  return `${Math.round(hours / 24)} 日前`;
}

const DAILY_COLUMNS: readonly Column<DailyPoint>[] = [
  { key: "day", header: "日付", accessor: (r) => r.day, sortable: true, nowrap: true },
  { key: "visitors", header: "訪問者", accessor: (r) => r.visitors, render: (r) => num(r.visitors), align: "right", sortable: true },
  { key: "sessions", header: "セッション", accessor: (r) => r.sessions, render: (r) => num(r.sessions), align: "right", sortable: true },
  { key: "pageviews", header: "ページビュー", accessor: (r) => r.pageviews, render: (r) => num(r.pageviews), align: "right", sortable: true },
  { key: "conversions", header: "CV", accessor: (r) => r.conversions, render: (r) => num(r.conversions), align: "right", sortable: true },
];

const PAGE_COLUMNS: readonly Column<PageStat>[] = [
  { key: "path", header: "ページ", accessor: (r) => r.path, render: (r) => <span className="font-mono text-[12px]">{r.path}</span>, sortable: true },
  { key: "pageviews", header: "ページビュー", accessor: (r) => r.pageviews, render: (r) => num(r.pageviews), align: "right", sortable: true },
  { key: "visitors", header: "訪問者", accessor: (r) => r.visitors, render: (r) => num(r.visitors), align: "right", sortable: true },
  { key: "avgSeconds", header: "平均滞在", accessor: (r) => r.avgSeconds, render: (r) => secondsText(r.avgSeconds), align: "right", sortable: true },
  { key: "conversions", header: "CV", accessor: (r) => r.conversions, render: (r) => num(r.conversions), align: "right", sortable: true },
];

const SOURCE_COLUMNS: readonly Column<SourceStat>[] = [
  { key: "name", header: "流入元", accessor: (r) => r.name, sortable: true },
  { key: "sessions", header: "セッション", accessor: (r) => r.sessions, render: (r) => num(r.sessions), align: "right", sortable: true },
];

const CHANNEL_COLUMNS: readonly Column<ChannelStat>[] = [
  { key: "channel", header: "流入元", accessor: (r) => CHANNEL_LABELS[r.channel], render: (r) => CHANNEL_LABELS[r.channel] },
  { key: "sessions", header: "セッション", accessor: (r) => r.sessions, render: (r) => num(r.sessions), align: "right", sortable: true },
  { key: "share", header: "割合", accessor: (r) => r.share, render: (r) => pct(r.share), align: "right", sortable: true },
  { key: "conversions", header: "CV があったセッション", accessor: (r) => r.conversions, render: (r) => num(r.conversions), align: "right", sortable: true },
];

function SnippetCard({ site }: { site: AnalyticsPayload["site"] }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(site.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <Card
      title="計測タグ（ホームページに貼る 1 行）"
      description="全ページのテンプレートの </head> の直前に貼ってください。Google アナリティクスの設定は不要です。貼った日から数字が出ます。"
      actions={
        <Button type="button" variant="secondary" size="sm" onClick={() => void copy()}>
          {copied ? "コピーしました" : "コピー"}
        </Button>
      }
    >
      <pre className="overflow-x-auto rounded-md border border-line bg-surface p-3 font-mono text-[12px] leading-relaxed">{site.snippet}</pre>
      <p className="mt-2 text-[12px] text-muted">
        最後に届いた計測: <strong className="text-ink">{relativeTime(site.lastEventAt)}</strong>
        {site.lastEventAt ? "" : "（貼り付け後にサイトを 1 回開くと届きます。反映まで数秒）"}
      </p>
      <p className="mt-1 text-[12px] text-muted">
        WordPress なら「外観 → テーマファイルエディター → header.php」か、タグ挿入プラグイン（Insert Headers and Footers 等）の head 欄に貼ります。制作会社に依頼する場合はこの 1 行をそのまま送ってください。
      </p>
    </Card>
  );
}

export function AnalyticsTool() {
  const [days, setDays] = useState<Days>(28);
  const { state, run } = useToolRun<AnalyticsPayload>();
  const load = useCallback((d: Days) => void run("/api/analytics", { days: d }), [run]);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const data = state.phase === "done" ? state.data : null;
  const running = state.phase === "running";

  if (state.phase === "error") {
    return (
      <Callout tone="fail" title="読み込めませんでした">
        <p>{state.message}</p>
        <p className="mt-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => load(days)}>
            もう一度読み込む
          </Button>
        </p>
      </Callout>
    );
  }
  if (!data) {
    return <EmptyState title="読み込んでいます…" description="計測タグと、これまでに届いた計測を集計しています。" />;
  }

  const { report, site } = data;
  const t = report.totals;
  const p = report.previous;
  const cvNow = conversionsTotal(t);
  const cvPrev = conversionsTotal(p);
  const hasData = t.pageviews > 0 || p.pageviews > 0;
  const maxChannel = Math.max(1, ...report.channels.map((c) => c.sessions));

  return (
    <div className="space-y-4">
      <SnippetCard site={site} />

      <Card
        title="期間"
        description={`${report.range.from} 〜 ${report.range.to}（${report.range.days} 日）。比較は ${report.previousRange.from} 〜 ${report.previousRange.to}`}
        actions={running ? <span className="text-[12px] text-muted">更新中…</span> : null}
      >
        <Tabs tabs={DAY_TABS} value={String(days) as "7" | "28" | "90"} onChange={(id) => setDays(Number(id) as Days)} ariaLabel="集計する期間" />
      </Card>

      {!hasData ? (
        <EmptyState
          title="まだ計測が届いていません"
          description="上の 1 行をホームページに貼ると、訪問者・流入元・電話やメールのタップがここに出ます。数字は推定ではなく、貼った日からの実測です。"
        />
      ) : (
        <>
          <Card title="サマリー" description="前の期間との差を矢印で示します">
            <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-3">
              <StatCard label="訪問者" value={num(t.visitors)} delta={delta(t.visitors, p.visitors)} hint="同じ人は 1 日 1 回だけ数えます" />
              <StatCard label="セッション" value={num(t.sessions)} delta={delta(t.sessions, p.sessions)} hint="30 分あくと別の訪問" />
              <StatCard label="ページビュー" value={num(t.pageviews)} delta={delta(t.pageviews, p.pageviews)} />
              <StatCard label="平均滞在時間" value={secondsText(t.avgSeconds)} hint="ページを開いてから離れるまで" />
              <StatCard
                label="CV（電話・メール・外部・フォーム）"
                value={num(cvNow)}
                delta={delta(cvNow, cvPrev)}
                hint={`CV があったセッション ${num(t.convertedSessions)}（${t.sessions ? pct(t.convertedSessions / t.sessions) : "—"}）`}
              />
              <StatCard label="生成 AI 経由のセッション" value={num(t.aiSessions)} delta={delta(t.aiSessions, p.aiSessions)} hint="ChatGPT / Gemini / Perplexity などから" />
            </div>
            <div className="mt-3 grid gap-2 text-[12px] text-muted @md:grid-cols-2 @3xl:grid-cols-4">
              {(Object.keys(CONVERSION_LABELS) as ConversionKind[]).map((k) => (
                <div key={k} className="rounded-md border border-line px-3 py-2">
                  <span className="block text-[11px]">{CONVERSION_LABELS[k]}</span>
                  <span className="text-[15px] font-bold text-ink">{num(t.conversions[k])}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-muted">
              端末: スマホ {num(report.devices.mobile)} セッション / パソコン {num(report.devices.desktop)} セッション
            </p>
          </Card>

          <Card title="日別の推移" actions={<Sparkline values={report.daily.map((d) => d.sessions)} width={160} height={32} ariaLabel="日別セッションの推移" />}>
            <DataTable columns={DAILY_COLUMNS} rows={report.daily} rowKey={(r) => r.day} defaultSort={{ key: "day", dir: "desc" }} />
          </Card>

          <Card title="流入元" description="セッションの最初のページに来た経路で分けています">
            {report.channels.length > 0 ? (
              <>
                <HBar
                  rows={report.channels.map((c) => ({ label: CHANNEL_LABELS[c.channel], value: c.sessions, valueLabel: `${num(c.sessions)}（${pct(c.share)}）` }))}
                  max={maxChannel}
                  valueTone="none"
                  labelWidth="12rem"
                  ariaLabel="流入元別のセッション数"
                />
                <div className="mt-4">
                  <DataTable columns={CHANNEL_COLUMNS} rows={report.channels} rowKey={(r) => r.channel} />
                </div>
              </>
            ) : (
              <p className="text-[13px] text-muted">この期間のセッションはありません。</p>
            )}
            <div className="mt-4 grid gap-4 @3xl:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[13px] font-bold">生成 AI の内訳</h3>
                {report.aiSources.length > 0 ? (
                  <DataTable columns={SOURCE_COLUMNS} rows={report.aiSources} rowKey={(r) => r.name} />
                ) : (
                  <p className="text-[12px] text-muted">生成 AI からの流入はまだありません。</p>
                )}
              </div>
              <div>
                <h3 className="mb-2 text-[13px] font-bold">他サイトからのリンク（上位）</h3>
                {report.referrers.length > 0 ? (
                  <DataTable columns={SOURCE_COLUMNS} rows={report.referrers} rowKey={(r) => r.name} />
                ) : (
                  <p className="text-[12px] text-muted">他サイトからの流入はまだありません。</p>
                )}
              </div>
            </div>
          </Card>

          <Card title="よく見られたページ" description="ページビューの多い順に 20 件">
            <DataTable columns={PAGE_COLUMNS} rows={report.pages} rowKey={(r) => r.path} />
          </Card>
        </>
      )}

      <Callout tone="info" title="この計測の仕組み">
        <p>
          Cookie もブラウザへの保存も使いません。IP アドレスは保存せず、訪問者の区別には日替わりのハッシュを使うので、翌日には同じ人でも別の訪問者として数えます（そのため月間の「ユニークユーザー」は出しません）。
          記録するのはページのパス・参照元のサイト名・UTM・端末の種別（スマホ / パソコン）だけです。生ログの保持は 400 日で、集計もその範囲で出します。
        </p>
      </Callout>
    </div>
  );
}
