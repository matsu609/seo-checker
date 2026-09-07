"use client";

/**
 * サイトレポート（E8）の画面。
 *
 * 上半分（KPI・流入グラフ）は GA4、下半分（最新の検索順位）は順位計測の履歴と
 * SerpApi に依存する。片方が未設定でも、もう片方は必ず描く（degraded mode）。
 * 数字が無いところにゼロのグラフを出さない。
 */
import Link from "next/link";
import { useMemo } from "react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  Select,
  SetupNotice,
  StatStrip,
} from "@/components/ui";
import { GRANULARITY_LABELS, METRIC_LABELS, type Granularity, type TrafficMetric } from "@/lib/ai-traffic/types";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import { INTEGRATIONS } from "@/lib/features/integrations";
import { formatRange, PERIOD_PRESETS, rangeForDays } from "@/lib/ga4/period";
import { buildRankRows } from "@/lib/rank/rows";
import { filterKeywords, rankGroupsStore, rankKeywordsStore, rankSnapshotsStore } from "@/lib/rank/store";
import { MAX_RANK } from "@/lib/rank/types";
import {
  aggregateChannels,
  channelColor,
  channelLabel,
  channelValues,
  topChannels,
} from "@/lib/site-report/channels";
import { CTR_CURVE, findabilityScore, formatFindability } from "@/lib/site-report/findability";
import { buildKpis } from "@/lib/site-report/kpi";
import {
  averageByBucket,
  formatAverageRank,
  OUT_OF_RANGE_OPTIONS,
  rankDailySeries,
  type OutOfRangeMode,
} from "@/lib/site-report/series";
import { siteReportSettingsStore } from "@/lib/site-report/store";
import {
  TREND_LABELS,
  TREND_ORDER,
  buildCsvColumns,
  buildSiteReportRows,
  competitorDomains as domainsOf,
  countByTrend,
  filterByTrend,
  type TrendFilter,
} from "@/lib/site-report/table";
import type { SiteReportResponse } from "@/lib/site-report/types";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";
import { KpiCards } from "./KpiCards";
import { RankLatestTable } from "./RankLatestTable";
import { FINDABILITY_MAX, TrafficChart, TrafficChartLegend, type TrafficSeries } from "./TrafficChart";

const GA4_MISSING = INTEGRATIONS.ga4.envVars.map((envVar) => ({
  key: INTEGRATIONS.ga4.key,
  envVar,
  description: INTEGRATIONS.ga4.description,
}));

export function SiteReportView() {
  const { status } = useIntegrations();
  const ga4Enabled = status?.ga4 === true;
  const serpEnabled = status?.serpapi === true;
  const { project } = useCurrentProject();

  const [settings, setSettings] = useStore(siteReportSettingsStore);
  const [keywords] = useStore(rankKeywordsStore);
  const [snapshots] = useStore(rankSnapshotsStore);
  const [groups] = useStore(rankGroupsStore);
  const { state, run, cancel } = useToolRun<SiteReportResponse>();

  // 絞り込みの選択も設定として保存する（再訪時に同じ見え方に戻る）
  const trend = settings.trendFilter;
  const setTrend = (next: TrendFilter) => setSettings({ ...settings, trendFilter: next });

  const data = state.phase === "done" ? state.data : null;

  /* ───────── 順位側（GA4 が無くても描ける） ───────── */

  const scoped = useMemo(
    () => filterKeywords(keywords, { projectId: project?.id ?? null }),
    [keywords, project?.id],
  );
  const scopedIds = useMemo(() => new Set(scoped.map((k) => k.id)), [scoped]);
  const scopedSnapshots = useMemo(
    () => snapshots.filter((s) => scopedIds.has(s.keywordId)),
    [snapshots, scopedIds],
  );

  const rankRows = useMemo(
    () => buildSiteReportRows(buildRankRows(scoped, scopedSnapshots, groups)),
    [scoped, scopedSnapshots, groups],
  );
  const allDomains = useMemo(() => domainsOf(rankRows), [rankRows]);
  const shownDomains = settings.showCompetitors ? allDomains : [];
  const trendCounts = useMemo(() => countByTrend(rankRows), [rankRows]);
  const filteredRows = useMemo(() => filterByTrend(rankRows, trend), [rankRows, trend]);

  const latestFindability = useMemo(
    () => findabilityScore(rankRows.map((r) => ({ rank: r.currentRank, volume: r.volume }))),
    [rankRows],
  );
  const measuredCount = rankRows.filter((r) => r.currentRank !== undefined).length;

  /** 折れ線用の日別系列（GA4 の期間が分かっていればその範囲に絞る） */
  const dailyPoints = useMemo(
    () =>
      rankDailySeries(scoped, scopedSnapshots, {
        ...(data ? { startDate: data.range.startDate, endDate: data.range.endDate } : {}),
        outOfRangeValue: settings.outOfRangeRank,
      }),
    [scoped, scopedSnapshots, data, settings.outOfRangeRank],
  );

  /* ───────── GA4 側 ───────── */

  const buckets = useMemo(
    () =>
      data
        ? aggregateChannels(data.channels, { granularity: settings.granularity, metric: settings.metric })
        : [],
    [data, settings.granularity, settings.metric],
  );
  const channels = useMemo(() => topChannels(buckets), [buckets]);
  const series = useMemo<TrafficSeries[]>(() => {
    const perBucket = buckets.map((b) => channelValues(b, channels));
    return channels.map((channel, i) => ({
      label: channelLabel(channel),
      color: channelColor(channel, i),
      values: perBucket.map((values) => values[i] ?? 0),
    }));
  }, [buckets, channels]);
  const bucketKeys = useMemo(() => buckets.map((b) => b.key), [buckets]);
  const averageRankSeries = useMemo(
    () => averageByBucket(dailyPoints, bucketKeys, settings.granularity, (p) => p.averageRank),
    [dailyPoints, bucketKeys, settings.granularity],
  );
  const findabilitySeries = useMemo(
    () => averageByBucket(dailyPoints, bucketKeys, settings.granularity, (p) => p.findability),
    [dailyPoints, bucketKeys, settings.granularity],
  );
  const kpis = useMemo(() => (data ? buildKpis(data.current, data.previous) : []), [data]);

  const outOfRangeLabel =
    settings.outOfRangeRank === null
      ? "圏外は平均から除外"
      : `圏外は ${settings.outOfRangeRank} 位として平均`;

  async function fetchReport() {
    const range = rangeForDays(settings.days);
    await run("/api/site-report", { startDate: range.startDate, endDate: range.endDate });
  }

  return (
    <div className="space-y-6">
      {/* 取得条件 */}
      <Card
        title="レポートの条件"
        description="GA4 の指標は当期と前期（同じ日数だけ直前）を 1 回のリクエストでまとめて取得します。GA4 は当日のデータが確定しないため、期間の終端は昨日です。"
        actions={
          <>
            <Button
              onClick={() => void fetchReport()}
              loading={state.phase === "running"}
              disabled={!ga4Enabled}
              title={ga4Enabled ? undefined : "GA4_PROPERTY_ID と GOOGLE_SERVICE_ACCOUNT_JSON が未設定です"}
            >
              レポートを取得
            </Button>
            {state.phase === "running" && (
              <Button variant="secondary" onClick={cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[13px]">
            <span className="mb-1 block font-bold text-ink">期間</span>
            <Select
              value={String(settings.days)}
              onChange={(e) => setSettings({ ...settings, days: Number(e.target.value) })}
              className="h-9 w-40 text-[13px]"
            >
              {PERIOD_PRESETS.map((p) => (
                <option key={p.days} value={p.days}>
                  {p.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block font-bold text-ink">比較単位</span>
            <Select
              value={settings.granularity}
              onChange={(e) => setSettings({ ...settings, granularity: e.target.value as Granularity })}
              className="h-9 w-28 text-[13px]"
            >
              {(Object.keys(GRANULARITY_LABELS) as Granularity[]).map((g) => (
                <option key={g} value={g}>
                  {GRANULARITY_LABELS[g]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block font-bold text-ink">指標</span>
            <Select
              value={settings.metric}
              onChange={(e) => setSettings({ ...settings, metric: e.target.value as TrafficMetric })}
              className="h-9 w-36 text-[13px]"
            >
              {(Object.keys(METRIC_LABELS) as TrafficMetric[]).map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block font-bold text-ink">圏外の扱い</span>
            <Select
              value={settings.outOfRangeRank === null ? "exclude" : String(settings.outOfRangeRank)}
              onChange={(e) => {
                const value: OutOfRangeMode = e.target.value === "exclude" ? null : Number(e.target.value);
                setSettings({ ...settings, outOfRangeRank: value });
              }}
              className="h-9 w-60 text-[13px]"
            >
              {OUT_OF_RANGE_OPTIONS.map((o) => (
                <option key={String(o.value)} value={o.value === null ? "exclude" : String(o.value)}>
                  {o.label}
                </option>
              ))}
            </Select>
          </label>
          {!ga4Enabled && <Badge tone="neutral">GA4 は要設定</Badge>}
          {!serpEnabled && <Badge tone="neutral">順位計測は要設定</Badge>}
        </div>
        {data && (
          <p className="mt-3 text-[11px] text-muted">
            当期 {formatRange(data.range)} ／ 前期 {formatRange(data.previousRange)}
            {data.cached ? "（サーバーのキャッシュから表示）" : ""}
          </p>
        )}
      </Card>

      {state.phase === "error" && (
        <Callout tone="fail" title="GA4 のデータを取得できませんでした">
          {state.message}
        </Callout>
      )}
      {data?.truncated && (
        <Callout tone="warn" title="取得件数の上限に達しました">
          期間を短くするか、比較単位を「週」「月」にしてください。グラフには取得できた分だけを表示しています。
        </Callout>
      )}

      {/* 上半分: KPI と流入グラフ（GA4） */}
      <Card
        title="サイト状況サマリー"
        description="ユーザー数・エンゲージメント・自然検索セッション・コンバージョンの当期と前期比です。"
      >
        {!ga4Enabled ? (
          <div className="space-y-3">
            <SetupNotice
              missing={GA4_MISSING}
              title="KPI と流入グラフには GA4 の連携が必要です"
            />
            <p className="text-[13px] leading-relaxed text-muted">
              連携すると、ユーザー数 / 新しいユーザー / 平均エンゲージメント時間 / エンゲージメント率 /
              自然検索セッション / コンバージョンの 6 指標を、当期・前期・増減率で表示します。
              下の「最新の検索順位」は GA4 が無くても利用できます。
            </p>
          </div>
        ) : !data ? (
          <EmptyState
            title="まだレポートを取得していません"
            description="期間を選んで「レポートを取得」を押すと、GA4 から当期と前期の指標をまとめて取得します。"
          />
        ) : (
          <div className="space-y-5">
            <KpiCards kpis={kpis} />
            <p className="text-[11px] text-muted">
              平均エンゲージメント時間は GA4 の userEngagementDuration ÷ activeUsers（1 ユーザーあたりの秒数）です。
              前期の値が 0 の指標は増減率を計算できないため「—」と表示します。
            </p>
          </div>
        )}
      </Card>

      {/* 流入と検索順位の複合グラフ */}
      <Card
        title="流入と検索順位"
        description={`チャネル別の${METRIC_LABELS[settings.metric]}（積み上げ棒）に、登録キーワードの平均順位とファインダビリティスコアを重ねています。`}
      >
        {!ga4Enabled ? (
          <EmptyState
            title="GA4 が未設定のためチャネル別の流入を表示できません"
            description="順位とファインダビリティスコアの推移だけを見る場合は、順位計測で日々のスナップショットを保存してください。"
            action={<ButtonLink href="/tools/rank">順位計測をひらく</ButtonLink>}
          />
        ) : !data ? (
          <EmptyState
            title="まだレポートを取得していません"
            description="「レポートを取得」を押すと、期間内の日別チャネル別セッションを取得します。"
          />
        ) : buckets.length === 0 ? (
          <EmptyState
            title="この期間の GA4 データがありません"
            description="期間を長くするか、GA4 プロパティにデータが入っているかを確認してください。"
          />
        ) : (
          <figure className="m-0">
            <TrafficChart
              labels={buckets.map((b) => b.label)}
              series={series}
              averageRank={averageRankSeries}
              findability={findabilitySeries}
              worstRank={settings.outOfRangeRank ?? MAX_RANK}
              metricLabel={METRIC_LABELS[settings.metric]}
            />
            <figcaption>
              <TrafficChartLegend series={series} metricLabel={METRIC_LABELS[settings.metric]} />
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                右軸は順位で、上が 1 位です。{outOfRangeLabel}しています。順位を計測していない日は線を切って描き、
                前の日の値を引き継ぎません。ファインダビリティスコアは Σ(月間検索数 × CTR(順位)) ÷ Σ 月間検索数 × 100
                で、全キーワードが 1 位のときの {FINDABILITY_MAX.toFixed(1)} が上限（グラフ上端）です。
                月間検索数が未登録のキーワードは計算から除外しています
                {dailyPoints.length > 0
                  ? `（直近の計測日で ${dailyPoints[dailyPoints.length - 1].excludedVolume} 件を除外）`
                  : ""}
                。
              </p>
            </figcaption>
          </figure>
        )}
      </Card>

      {/* 下半分: 最新の検索順位（自社・競合） */}
      <Card
        title="最新の検索順位（自社・競合）"
        description="順位計測（B1）で保存した最新のスナップショットと、その 1 つ前を比較しています。"
        actions={
          <>
            <label className="inline-flex items-center gap-1.5 text-[13px] text-ink">
              <input
                type="checkbox"
                checked={settings.showCompetitors}
                onChange={(e) => setSettings({ ...settings, showCompetitors: e.target.checked })}
                disabled={allDomains.length === 0}
                className="h-4 w-4 rounded-sm border-line text-accent"
              />
              競合の順位を表示
            </label>
            <Button
              variant="secondary"
              onClick={() =>
                downloadCsv(
                  csvFileName("site-report-rank", new Date()),
                  buildCsvColumns(shownDomains),
                  filteredRows,
                )
              }
              disabled={filteredRows.length === 0}
            >
              CSV
            </Button>
          </>
        }
      >
        {scoped.length === 0 || !serpEnabled ? (
          <div className="space-y-3">
            <EmptyState
              title={
                scoped.length === 0
                  ? "登録されたキーワードがありません"
                  : "順位計測には SerpApi の設定が必要です"
              }
              description={
                scoped.length === 0
                  ? "順位計測の画面でキーワードを登録し、計測すると、この表と平均順位・ファインダビリティスコアが埋まります。"
                  : "SERPAPI_KEY をサーバーに設定すると順位を計測できます。すでに保存済みのスナップショットがあれば、この表はそのまま表示されます。"
              }
              action={<ButtonLink href="/tools/rank">順位計測をひらく</ButtonLink>}
            />
            {scoped.length > 0 && rankRows.some((r) => r.currentRank !== undefined) && (
              <RankLatestTable rows={filteredRows} competitorDomains={shownDomains} />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <StatStrip
              items={[
                { label: "登録キーワード", value: scoped.length, unit: "件" },
                { label: "計測済み", value: measuredCount, unit: "件" },
                { label: "平均順位", value: formatAverageRank(dailyPoints.at(-1)?.averageRank ?? null) },
                {
                  label: `ファインダビリティ（上限 ${FINDABILITY_MAX.toFixed(1)}）`,
                  value: formatFindability(latestFindability.score),
                },
                { label: "月間検索数 未登録", value: latestFindability.excluded, unit: "件" },
              ]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold text-muted">トレンドで絞り込む</span>
              <Button
                size="sm"
                variant={trend === "all" ? "primary" : "secondary"}
                onClick={() => setTrend("all")}
                aria-pressed={trend === "all"}
              >
                すべて（{rankRows.length}）
              </Button>
              {TREND_ORDER.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={trend === t ? "primary" : "secondary"}
                  onClick={() => setTrend(t)}
                  aria-pressed={trend === t}
                >
                  {TREND_LABELS[t]}（{trendCounts[t]}）
                </Button>
              ))}
            </div>
            <RankLatestTable
              rows={filteredRows}
              competitorDomains={shownDomains}
              emptyText={
                trend === "all"
                  ? "まだ計測結果がありません。順位計測で計測すると表示されます。"
                  : `「${TREND_LABELS[trend]}」に該当するキーワードはありません。`
              }
            />
            {allDomains.length === 0 && (
              <p className="text-[11px] text-muted">
                競合ドメインを
                <Link href="/settings" className="mx-1 font-bold text-accent underline-offset-2 hover:underline">
                  設定画面
                </Link>
                に登録して計測すると、「競合の順位を表示」で競合の順位を並べられます。
              </p>
            )}
          </div>
        )}
      </Card>

      {/* 説明（連携が未設定でも必ず出す） */}
      <Card
        title="ファインダビリティスコアの計算方法"
        headingLevel={3}
        description={`登録キーワードの検索ボリュームで重み付けした可視性の指数です。重要なキーワードで上位にいるほど高くなります。CTR カーブの最大値が 1 位の ${FINDABILITY_MAX.toFixed(1)}% なので、全キーワードが 1 位でもスコアは ${FINDABILITY_MAX.toFixed(1)} が上限です（100 点満点ではありません）。`}
      >
        <p className="text-[13px] leading-relaxed text-ink">
          スコア = Σ(月間検索数 × CTR(順位)) ÷ Σ 月間検索数 × 100
        </p>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          {CTR_CURVE.map((band) => (
            <li key={band.label} className="tabular-nums">
              {band.label} <span className="text-ink">{(band.ctr * 100).toFixed(1)}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-muted">
          月間検索数が未登録のキーワードは分子・分母のどちらからも除外します（0 として数えると実態より低いスコアになるため）。
          まだ一度も計測していないキーワードも同じ理由で除外します（圏外と同じ扱いにすると、登録しただけでスコアが下がり、
          グラフの推移とも食い違うため）。除外した件数は上の「月間検索数 未登録」と「登録キーワード − 計測済み」で確認できます。
          月間検索数は順位計測のキーワード登録で入力できます。
        </p>
      </Card>
    </div>
  );
}
