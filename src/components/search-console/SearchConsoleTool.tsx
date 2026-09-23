"use client";

/**
 * SEO の「Google サーチコンソール連携」（利用者の指示 2026-09-23 で再実装）。
 *
 * 1 画面で完結させる: ①Google アカウントの接続（読み取り権限）→ ②見るサイトの選択 →
 * ③検索パフォーマンス（クリック・表示回数・CTR・平均掲載順位、日別の推移、クエリ別・ページ別）。
 * 状態（接続・一覧・選択中）はサーバー側（page.tsx）が渡し、保存後は router.refresh() で取り直す。
 * 連携前・未選択のあいだは、何が出るようになるかを「イメージ」（破線）で見せる。
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LineChart, SampleBadge, SampleChart } from "@/components/charts";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Field, Select } from "@/components/ui/Field";
import { StatCard } from "@/components/ui/StatCard";
import { Tabs } from "@/components/ui/Tabs";
import { isUnverifiedSite } from "@/lib/google/search-console/parse";
import { SEARCH_CONSOLE_PERIODS } from "@/lib/google/search-console/period";
import { needsSearchConsoleSetup, usableSites, type SearchConsoleStatus } from "@/lib/google/search-console/setup";
import type { SearchAnalyticsRow, SearchPerformanceResponse } from "@/lib/google/search-console/types";
import { ANALYSIS_TARGET_CHARS, analysisChars, createdDateJst, formatJpDate, pathOf, type AnalysisRecord } from "@/lib/google/search-console/analysis";
import { ConnectSearchConsoleButton } from "./ConnectSearchConsoleButton";
import { changeRate, dayLabel, formatCtr, formatInt, formatPosition, sampleDailyClicks, shortenUrl } from "./format";

type TabId = "queries" | "pages";
const UNSELECTED = "";

export function SearchConsoleTool({ status }: { status: SearchConsoleStatus }) {
  return (
    <div className="space-y-6">
      <ConnectionCard status={status} />
      {status.hasScope && status.siteUrl ? <PerformanceSection key={status.siteUrl} siteUrl={status.siteUrl} analysis={status.analysis} /> : <SamplePreview />}
    </div>
  );
}

/** ①接続と②サイトの選択 */
function ConnectionCard({ status }: { status: SearchConsoleStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(siteUrl: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/search-console/site", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ siteUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `保存できませんでした（HTTP ${res.status}）`);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setSaving(false);
    }
  }

  const refresh = () => startTransition(() => router.refresh());
  const busy = saving || pending;

  return (
    <Card
      title="連携の設定"
      description="Google サーチコンソールのデータを、ログインしているアカウントごとに読み取ります。要求するのは読み取り専用の権限だけで、サイトの設定は変更しません。"
    >
      {error && (
        <Callout tone="fail" title="保存できませんでした" className="mb-4">
          {error}
        </Callout>
      )}

      {!status.connected || !status.hasScope ? (
        <div className="space-y-3">
          <Callout tone="info" title={status.connected ? "Search Console を読む権限がまだありません" : "Google アカウントがまだ接続されていません"}>
            <p>
              {status.connected
                ? `接続中の Google アカウント（${status.email ?? "Google アカウント"}）に、Search Console の読み取りの許可を足します。口コミ返信など、すでに許可している権限はそのまま残ります。`
                : "Search Console にサイトを登録している Google アカウントで接続してください。そのアカウントで見られるサイトの中から、見る対象を選べるようになります。"}
            </p>
            <p className="mt-2">ログインに「Google で続ける」をお使いの場合も、この許可は別に必要です（ログインはご本人の確認だけで、Search Console を読む許可は含まれていません）。</p>
          </Callout>
          <ConnectSearchConsoleButton
            grantedScopes={status.grantedScopes}
            label={status.connected ? "Search Console の読み取りを許可する" : "Google アカウントを接続する"}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink">
            接続中: <span className="break-all font-bold">{status.email ?? "Google アカウント"}</span>
          </p>

          {status.error && (
            <Callout tone="warn" title="Search Console のサイト一覧を取得できませんでした">
              <p>{status.error}</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={refresh} loading={pending}>
                一覧を取り直す
              </Button>
            </Callout>
          )}

          {needsSearchConsoleSetup(status) ? (
            <SetupGuide onRefresh={refresh} refreshing={pending} />
          ) : (
            !status.error && (
              <Field label="対象サイト" hint="所有権が確認済みのサイトだけを選べます。選んだ内容はこのアカウントにだけ適用されます。">
                <Select value={status.siteUrl ?? UNSELECTED} disabled={busy || usableSites(status.sites).length === 0} onChange={(e) => void save(e.target.value || null)}>
                  <option value={UNSELECTED}>選択してください</option>
                  {status.sites.map((s) => (
                    <option key={s.siteUrl} value={s.siteUrl} disabled={isUnverifiedSite(s)}>
                      {s.label}
                      {isUnverifiedSite(s) && "（所有権が未確認）"}
                    </option>
                  ))}
                </Select>
              </Field>
            )
          )}

          <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted">
            <span>別の Google アカウントのサイトを見たいときは、そのアカウントで Search Console の「ユーザーと権限」に接続中のアカウントを追加してください。</span>
          </div>
        </div>
      )}
    </Card>
  );
}

/** 使えるサイトが 1 つも無いときの案内（登録・所有確認は Google 側の作業で、代行できない） */
function SetupGuide({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  const steps = [
    {
      text: "別の Google アカウントで運用中なら、そのアカウントの Search Console で「設定 → ユーザーと権限」から、接続中のアカウントを「制限付き」で追加する",
      href: "https://search.google.com/search-console/users",
      linkLabel: "ユーザーと権限を開く",
    },
    { text: "まだ登録していないなら、Search Console でサイトを追加する", href: "https://search.google.com/search-console/welcome", linkLabel: "Search Console を開く" },
    { text: "所有権を確認する（DNS レコード、HTML ファイル、Google タグなど）", href: "https://support.google.com/webmasters/answer/9008080?hl=ja", linkLabel: "確認方法を見る" },
    { text: "この画面に戻って「一覧を取り直す」を押す" },
  ];
  return (
    <Callout tone="warn" title="Search Console に、使えるサイトがありません">
      <p>接続した Google アカウントで所有権が確認済みのサイトだけを読み取れます。サイトの登録と所有権の確認は Google 側での作業になり、この画面からは代行できません。</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px]">
        {steps.map((step) => (
          <li key={step.text}>
            {step.text}
            {step.href && (
              <>
                {" "}
                <a href={step.href} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap underline underline-offset-2 hover:no-underline">
                  {step.linkLabel}
                  <span aria-hidden="true"> ↗</span>
                </a>
              </>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[13px]">登録直後はデータが貯まっていないため、数日は数値が出ないことがあります。</p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={onRefresh} loading={refreshing}>
        一覧を取り直す
      </Button>
    </Callout>
  );
}

/** ③検索パフォーマンス（実測） */
function PerformanceSection({ siteUrl, analysis }: { siteUrl: string; analysis: SearchConsoleStatus["analysis"] }) {
  const [days, setDays] = useState<number>(28);
  const [data, setData] = useState<SearchPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("queries");

  async function run(nextDays = days, refresh = false) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search-console/performance", {
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

  return (
    <div className="space-y-6">
      <Card
        title="検索パフォーマンス"
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
          {SEARCH_CONSOLE_PERIODS.map((d) => (
            <Button
              key={d}
              size="sm"
              variant={d === days && data ? "primary" : "ghost"}
              disabled={loading}
              onClick={() => {
                setDays(d);
                void run(d);
              }}
            >
              {d} 日
            </Button>
          ))}
          {!data && (
            <Button size="sm" disabled={loading} loading={loading} onClick={() => void run()}>
              {loading ? "取得中…" : "直近 28 日を取得する"}
            </Button>
          )}
        </div>
        {data && (
          <p className="mt-2 text-[12px] text-muted">
            {data.range.startDate} 〜 {data.range.endDate}（前期間 {data.previous.startDate} 〜 {data.previous.endDate}）。Search Console はデータの確定に数日かかるため、終了日は {data.lagDays} 日前です。
          </p>
        )}
        {!data && !loading && !error && <p className="mt-2 text-[12px] text-muted">期間を選ぶと、Search Console から実測値を取得します（無料）。</p>}
      </Card>

      {error && (
        <Callout tone="fail" title="取得できませんでした">
          {error}
        </Callout>
      )}

      <AnalysisCard initial={analysis} days={days} siteUrl={siteUrl} />

      {data && <Summary data={data} />}
      {data && (
        <Card title="上位の内訳" description="クリックの多い順に最大 100 件。列の見出しで並べ替えられます。">
          <Tabs
            tabs={[
              { id: "queries", label: "検索キーワード", count: data.queries.length },
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
              columns={rowColumns("検索キーワード", (r) => r.keys[0] ?? "")}
              rowKey={(r, i) => `${r.keys[0] ?? ""}-${i}`}
              defaultSort={{ key: "clicks", dir: "desc" }}
              emptyText="この期間に表示された検索キーワードがありません。"
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
    </div>
  );
}

/**
 * AI の分析（月 1 回）。前回の結果はいつでも見られる。
 * 1 回しか使えないので、押したら 1 段確かめてから走らせる（押し間違いで今月の分を失わないように）
 */
function AnalysisCard({ initial, days, siteUrl }: { initial: SearchConsoleStatus["analysis"]; days: number; siteUrl: string }) {
  const [last, setLast] = useState<AnalysisRecord | null>(initial.last);
  const [available, setAvailable] = useState(initial.available);
  const [nextOn, setNextOn] = useState<string | null>(initial.nextAvailableOn);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setConfirming(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search-console/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.code === "usage_limit") {
          setAvailable(false);
          setNextOn(body.resetsOn ?? null);
        }
        throw new Error(body.error ?? `分析できませんでした（HTTP ${res.status}）`);
      }
      setLast(body.analysis as AnalysisRecord);
      // 運用者は nextAvailableOn が null（回数を数えない）
      setAvailable(body.nextAvailableOn === null);
      setNextOn(body.nextAvailableOn ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析できませんでした");
    } finally {
      setLoading(false);
    }
  }

  const otherSite = last && last.siteUrl !== siteUrl;

  return (
    <Card
      title="AI の現状分析とネクストアクション"
      description={`Search Console の数字（直近 ${days} 日）を AI に読ませ、どのページ・キーワードから手を付けるべきかを ${ANALYSIS_TARGET_CHARS} 文字程度でまとめます。月に 1 回使えます（毎月 1 日に 1 回分が付き、翌月には持ち越しません）。`}
      actions={
        initial.enabled && available && !confirming ? (
          <Button size="sm" loading={loading} onClick={() => setConfirming(true)}>
            AI で分析する（今月あと 1 回）
          </Button>
        ) : null
      }
    >
      {!initial.enabled && <p className="text-[13px] text-muted">AI の分析には、サーバーに ANTHROPIC_API_KEY の設定が必要です。</p>}

      {confirming && (
        <Callout tone="info" title={`直近 ${days} 日の数字で分析します。今月の 1 回を使います。よろしいですか？`} className="mb-4">
          <p>期間を変えたいときは、先に上の期間ボタンで選び直してください。失敗したときは回数を消費しません。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void run()}>
              分析する
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              やめる
            </Button>
          </div>
        </Callout>
      )}

      {loading && <p className="text-[13px] text-muted">AI が数字を読んでいます（30 秒〜1 分ほど）…</p>}

      {error && (
        <Callout tone="warn" className="mb-4">
          {error}
        </Callout>
      )}

      {initial.enabled && !available && nextOn && (
        <p className="mb-3 text-[12px] text-muted">今月の分析は使用済みです。次は {formatJpDate(nextOn)}から使えます。</p>
      )}

      {last ? (
        <div className="space-y-4 text-[13px] leading-relaxed">
          <p className="text-[11px] text-muted">
            {formatJpDate(createdDateJst(last.createdAt))}に作成 ・ 対象 {last.range.startDate} 〜 {last.range.endDate} ・ {analysisChars(last)} 文字
            {otherSite && `（別のサイト ${last.siteUrl} の分析です）`}
          </p>
          <div>
            <h3 className="mb-1.5 text-sm font-bold text-ink">現状分析</h3>
            <p className="text-ink">{last.summary}</p>
          </div>
          <div>
            <h3 className="mb-1.5 text-sm font-bold text-ink">ネクストアクション</h3>
            <ol className="space-y-2">
              {last.actions.map((a, i) => (
                <li key={i} className="border-l-2 border-accent pl-3 text-ink">
                  <span className="mr-1 font-bold tabular-nums">{i + 1}.</span>
                  <span className="break-all font-bold">{a.target.startsWith("http") ? pathOf(a.target) : a.target}</span>
                  <span className="block">{a.action}</span>
                </li>
              ))}
            </ol>
          </div>
          <p className="text-[11px] text-muted">AI は Search Console の数字だけを読んで書いています。ページの中身は見ていないので、直す前に該当ページを開いて確かめてください。</p>
        </div>
      ) : (
        !confirming && !loading && initial.enabled && <p className="text-[13px] text-muted">まだ分析していません。「AI で分析する」を押すと、ここに現状分析とネクストアクション 3 件が出ます。</p>
      )}
    </Card>
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
        <StatCard label="表示回数" value={formatInt(totals.impressions)} delta={rate(totals.impressions, previousTotals.impressions)} />
        <StatCard label="CTR" value={formatCtr(totals.ctr)} delta={rate(totals.ctr, previousTotals.ctr)} />
        <StatCard
          label="平均掲載順位"
          value={formatPosition(totals.position)}
          // 掲載順位は小さいほど良い
          delta={previousTotals.position > 0 ? { value: Number((totals.position - previousTotals.position).toFixed(1)), positiveIsGood: false, label: "前期比" } : undefined}
          hint="1 に近いほど上位"
        />
      </div>
      {daily.length > 1 && (
        <LineChart
          className="mt-4"
          labels={daily.map((d) => dayLabel(d.keys[0] ?? ""))}
          series={[{ id: "clicks", label: "クリック数", values: daily.map((d) => d.clicks), fill: true }]}
          yMin={0}
          height={200}
          format={(v) => (v === null ? "—" : `${formatInt(v)} 回`)}
          xHeader="日付"
          ariaLabel={`日別のクリック数（${daily.length} 日分）`}
        />
      )}
    </Card>
  );
}

/** 連携前・未選択のあいだに出す「イメージ」 */
function SamplePreview() {
  const values = sampleDailyClicks();
  const labels = values.map((_, i) => `${i + 1} 日目`);
  return (
    <Card title="連携するとこう表示されます" actions={<SampleBadge />}>
      <SampleChart
        lead="まだ Search Console のデータを読み込んでいません。上で接続して対象サイトを選ぶと、実際のクリック数・表示回数・CTR・平均掲載順位と、この形の推移に置き換わります。"
        note={
          <>
            縦軸は 1 日のクリック数です。あわせて、クリックの多い検索キーワードとページの上位 100 件を表で出します。
            数字は Search Console の実測値で、「順位計測」の推定とは別物です。
          </>
        }
      >
        <LineChart
          labels={labels}
          series={[{ id: "sample-clicks", label: "クリック数（イメージ）", values, dashed: true }]}
          yMin={0}
          height={200}
          format={(v) => (v === null ? "—" : `${formatInt(v)} 回`)}
          xHeader="日"
          ariaLabel="日別のクリック数のイメージ（実測ではありません）"
        />
      </SampleChart>
    </Card>
  );
}

/** クエリ / ページで共通の列 */
function rowColumns(header: string, label: (row: SearchAnalyticsRow) => string, title?: (row: SearchAnalyticsRow) => string): Column<SearchAnalyticsRow>[] {
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
