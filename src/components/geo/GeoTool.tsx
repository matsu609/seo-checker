"use client";

/**
 * AI 検索モニタリングの画面（仕様書 §10 UI 要件）。
 *
 * 並びは 予定バナー → フィルタ行 → 数字 4 つ → 2 カラム（左 = 推移と明細 / 右 = 順位と操作）。
 * 1 カラムに 17 ブロック縦積みだったのを 2026-09-22 に組み替えた（利用者の指示）。
 * 統計の扱いは lib/geo/stats.ts に寄せてあり、この画面は表示だけを持つ。
 */
import { useEffect, useState } from "react";
import { Badge, Button, ButtonLink, Callout, Card, Field, Input, StatCard, Tabs } from "@/components/ui";
import { SITE_SETTINGS_HREF } from "@/components/site/RegisteredSite";
import { NORMAL_REPEATS_PER_WEEK, PRECISION_REPEATS_PER_WEEK } from "@/lib/geo/schedule";
import { CREDIT_ACTION_LABELS, GEO_LLM_MODELS, GEO_MODEL_LABELS, type CreditAction, type GeoModel } from "@/lib/geo/types";
import { pct } from "@/lib/report/format";
import { BrandedCard } from "./BrandedCard";
import { SetupPanel } from "./SetupPanel";
import { ShareCard } from "./ShareCard";
import { TargetBars } from "./TargetBars";
import { TrendChart } from "./TrendChart";
import { IndustryMapCard } from "./IndustryMapCard";
import { DomainsCard, FilterBar, RecentOutputsCard, ScheduleBanner } from "./DashboardParts";
import type { ObservationFilter } from "@/lib/geo/aggregate";
import { fetchDashboard, fetchSetup, runLive, type DashboardResponse, type LiveResult, type SetupResponse } from "./client";

type TabId = "dashboard" | "setup";

export function GeoTool() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tick, setTick] = useState(0);
  const [filter, setFilter] = useState<ObservationFilter>({ model: "all", tag: "all", days: 28 });
  const [filtering, setFiltering] = useState(false);

  // 読み込みは効果の中で同期に setState しない（再レンダーの連鎖を避ける）
  useEffect(() => {
    let alive = true;
    Promise.all([fetchSetup(), fetchDashboard(filter)])
      .then(([s, d]) => {
        if (!alive) return;
        setSetup(s);
        setDashboard(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : "読み込めませんでした");
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
        setFiltering(false);
      });
    return () => {
      alive = false;
    };
    // filter が変わったら読み直す（サーバー側で絞る）
  }, [tick, filter]);

  const reload = () => setTick((t) => t + 1);
  const changeFilter = (next: ObservationFilter) => {
    setFiltering(true);
    setFilter(next);
  };

  if (error) {
    return (
      <Callout tone="fail" title="読み込めませんでした">
        {error}
      </Callout>
    );
  }
  if (loading && !dashboard) return <p className="text-[13px] text-muted">読み込んでいます…</p>;

  return (
    <div className="space-y-6">
      <Tabs
        tabs={[
          { id: "dashboard", label: "ダッシュボード" },
          { id: "setup", label: "プロンプトと計測対象" },
        ]}
        value={tab}
        onChange={setTab}
        ariaLabel="AI 検索モニタリングの表示切り替え"
      />

      {tab === "dashboard" && dashboard && setup && (
        <Dashboard
          data={dashboard}
          keywords={setup.keywords.map((k) => k.text)}
          prompts={setup.prompts.map((p) => p.text)}
          filter={filter}
          filtering={filtering}
          onFilter={changeFilter}
          onGoSetup={() => setTab("setup")}
          onChanged={reload}
        />
      )}
      {tab === "setup" && setup && <SetupPanel setup={setup} onChanged={reload} />}
    </div>
  );
}

function Dashboard({
  data,
  keywords,
  prompts,
  filter,
  filtering,
  onFilter,
  onGoSetup,
  onChanged,
}: {
  data: DashboardResponse;
  keywords: string[];
  prompts: string[];
  filter: ObservationFilter;
  filtering: boolean;
  onFilter: (next: ObservationFilter) => void;
  onGoSetup: () => void;
  onChanged: () => void;
}) {
  const own = data.brands.find((b) => b.type === "own") ?? null;
  const ownShare = own ? data.overall.find((r) => r.brandId === own.id) : undefined;
  const resetAt = new Date(data.account.creditResetAt).toLocaleDateString("ja-JP");

  // 準備が済んでいなくても**イメージのグラフは見せる**（利用者の指示 2026-09-21）。
  // 「何が取れるのか分からないまま登録させない」ため、案内の下に破線の見本を出す。
  if (!own || data.promptCount === 0) {
    return (
      <>
        <Callout tone="info" title="まず準備をしてください">
          <p className="leading-relaxed">
            {own
              ? "計測するプロンプトを登録すると、翌日の定期計測から数字が入ります。下のグラフは、計測が始まったあとの見え方のイメージです。"
              : "自社のホームページ（URL・サイト名・ブランドの表記ゆれ）は「設定」に登録します。登録が済むと自社ブランドとして自動で取り込まれ、あとは計測するプロンプトを登録するだけです。下のグラフは、計測が始まったあとの見え方のイメージです。"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!own && (
              <ButtonLink href={SITE_SETTINGS_HREF} size="sm">
                設定でホームページを登録する
              </ButtonLink>
            )}
            <Button size="sm" variant={own ? "primary" : "secondary"} onClick={onGoSetup}>
              プロンプトを登録する
            </Button>
          </div>
        </Callout>

        <TrendChart
          weeks={data.trends.weeks}
          series={[]}
          title="キーワードごとの推移（週ごと）"
          description="設定の「対策キーワード」1 語ずつに、その週の AI Overviews / AI モードで自社が引用された割合を並べます。上がっているか下がっているかを追うためのグラフです。"
          emptyText="設定の「対策キーワード」を登録すると、週 1 回（月曜）の計測から実線が引かれます。"
          unit="キーワード"
          sampleLabels={keywords}
        />

        <TrendChart
          weeks={data.trends.weeks}
          series={[]}
          title="プロンプトごとの推移（週ごと）"
          description="登録したプロンプト 1 本ずつに、その週の回答本文で自社の名前が出た割合を並べます。"
          emptyText="「プロンプトと計測対象」でプロンプトを登録すると、翌日の定期計測から実線が引かれます。"
          unit="プロンプト"
          sampleLabels={prompts}
        />
      </>
    );
  }

  const periodLabel = filter.days === 7 ? "1 週間" : filter.days === 56 ? "8 週間" : filter.days === 90 ? "90 日" : "4 週間";
  return (
    <div className="space-y-6">
      <ScheduleBanner schedule={data.schedule} />

      <FilterBar
        value={filter}
        tags={data.tags}
        models={Object.keys(data.perModel) as GeoModel[]}
        onChange={onFilter}
        busy={filtering}
      />

      <div className="grid gap-3 @2xl:grid-cols-4">
        <StatCard
          label={`ブランドシェア（${periodLabel}）`}
          value={ownShare ? pct(ownShare.shareMention) : "—"}
          hint={ownShare ? `観測 ${ownShare.n} 件・95% 信頼区間 ${pct(ownShare.ciLow)}〜${pct(ownShare.ciHigh)}` : "この条件では観測がありません"}
        />
        <StatCard label="登録プロンプト" value={data.promptCount} unit="本" hint={`うち高精度枠 ${data.precisionCount} 本`} />
        <StatCard
          label="クレジット残高"
          value={data.credits.balance}
          unit={`/ ${data.credits.balance + data.credits.spent}`}
          hint={`今月 ${data.credits.spent} 消費・${resetAt} にリセット（繰越なし）`}
        />
        <StatCard label="要確認の判定" value={data.needsReview} unit="件" hint="同名の一般名詞などで判定に自信が無いもの" />
      </div>

      {/* 左 = 推移と明細（広い）、右 = 順位と操作（狭い）。1 カラム 17 ブロックの縦積みをやめた */}
      <div className="grid items-start gap-6 @5xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-6">
          <TrendChart
            weeks={data.trends.weeks}
            series={data.trends.keyword}
            title="キーワードごとの推移（週ごと）"
            description="設定の「対策キーワード」1 語ずつに、その週の AI Overviews / AI モードで自社が引用された割合を並べたものです。上がっているか下がっているかを追うためのグラフです。"
            emptyText="まだ計測結果がありません。設定の「対策キーワード」を登録すると、週 1 回（月曜）の計測から実線が引かれます。"
            unit="キーワード"
            sampleLabels={keywords}
          />

          <TrendChart
            weeks={data.trends.weeks}
            series={data.trends.prompt}
            title="プロンプトごとの推移（週ごと）"
            description="登録したプロンプト 1 本ずつに、その週の回答本文で自社の名前が出た割合を並べたものです。"
            emptyText="まだ計測結果がありません。「プロンプトと計測対象」でプロンプトを登録すると、翌日の定期計測から実線が引かれます。"
            unit="プロンプト"
            sampleLabels={prompts}
          />

          <TargetBars
            rows={data.perPrompt}
            title={`プロンプトごとの出現率（${periodLabel}）`}
            description="登録したプロンプト 1 本ずつに、回答本文で自社の名前が出た割合です。棒が平均、帯がありうる範囲（狭いほど信用できます）。"
            cadence={`通常のプロンプトが週 ${NORMAL_REPEATS_PER_WEEK} 回（月・水・金に分散）× モデル数、高精度枠が週 ${PRECISION_REPEATS_PER_WEEK} 回`}
            emptyText="まだ計測結果がありません。「プロンプトと計測対象」でプロンプトを登録すると、翌日の定期計測から数字が入ります。"
            modelFilter
          />

          <TargetBars
            rows={data.perKeyword}
            title={`キーワードごとの AI 引用率（${periodLabel}）`}
            description="設定の「対策キーワード」で Google を検索し、AI による概要（AI Overviews）や AI モードの参照リンクに自社ドメインが入っていた割合です。"
            cadence="週 1 回（月曜）なので 4 週で 4 回。帯が広いのはそのため"
            emptyText={
              data.keywordCount === 0
                ? "設定の「対策キーワード」にキーワードを登録すると、週 1 回の計測が始まります。"
                : "登録済みのキーワードの計測はこれからです。翌週の月曜から数字が入ります。"
            }
          />

          <RecentOutputsCard items={data.recent} />
        </div>

        <div className="min-w-0 space-y-6">
          <ShareCard
            rows={data.overall}
            brands={data.brands}
            title="競合とのブランドシェア"
            description={`登録したプロンプト全体で、回答本文に各ブランドの名前が出た割合です（直近 ${periodLabel}）。1 週間の上下は誤差に埋もれます。`}
          />

          <ModelBreakdown perModel={data.perModel} brands={data.brands} />

          <DomainsCard domains={data.domains} />

          {data.branded && data.branded.n > 0 && <BrandedCard branded={data.branded} />}

          <IndustryMapCard balance={data.credits.balance} keywords={keywords} onRan={onChanged} />

          <LiveRunCard balance={data.credits.balance} />
          <CreditsCard credits={data.credits} resetAt={resetAt} />
          {data.versions.length > 0 && <VersionsCard versions={data.versions} />}
        </div>
      </div>
    </div>
  );
}

/**
 * モデル別のブランドシェア。以前はモデルの数だけカードを並べていたが、
 * モデルが 6 つに増えて縦に伸びすぎたので **1 枚に畳んで切り替え**にした（2026-09-22）。
 */
function ModelBreakdown({ perModel, brands }: { perModel: DashboardResponse["perModel"]; brands: DashboardResponse["brands"] }) {
  const models = Object.keys(perModel) as GeoModel[];
  const [model, setModel] = useState<GeoModel | null>(models[0] ?? null);
  const current = model && perModel[model] ? perModel[model] : [];

  if (models.length === 0) {
    return (
      <Card title="モデル別" description="モデルごとに引用の癖が違います。計測が始まるとここで比べられます。">
        <p className="text-[13px] text-muted">まだ計測結果がありません。</p>
      </Card>
    );
  }

  return (
    <ShareCard
      rows={current}
      brands={brands}
      title="モデル別のブランドシェア"
      description="モデルごとに引用の癖が違います。1 つだけ落ちたときはモデルの更新を疑ってください（「モデルの更新」を参照）。"
      actions={
        <select
          className="rounded-sm border border-line bg-panel px-2 py-1 text-[12px] text-ink"
          value={model ?? ""}
          onChange={(e) => setModel(e.target.value as GeoModel)}
          aria-label="モデルを選ぶ"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {GEO_MODEL_LABELS[m] ?? m}
            </option>
          ))}
        </select>
      }
    />
  );
}

function CreditsCard({ credits, resetAt }: { credits: DashboardResponse["credits"]; resetAt: string }) {
  const entries = Object.entries(credits.byAction) as [CreditAction, number][];
  return (
    <Card
      title="クレジットの消費内訳（今月）"
      description={`1 クレジット = 原価 ¥1 相当。繰越はなく ${resetAt} にリセットされます。使い切っても定期計測は止まりません（「今すぐ実行」だけが止まります）。`}
    >
      {entries.length === 0 ? (
        <p className="text-[13px] text-muted">今月はまだ消費がありません。</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {entries.map(([action, credits_]) => (
            <li key={action} className="flex items-center justify-between py-2 text-[13px]">
              <span className="text-ink">{CREDIT_ACTION_LABELS[action] ?? action}</span>
              <span className="tabular-nums text-muted">{credits_}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted">
        標準構成の見込みは月 {credits.forecast.total} クレジット（残り {credits.forecast.remaining} がオンデマンド枠）です。
      </p>
    </Card>
  );
}

function LiveRunCard({ balance }: { balance: number }) {
  const [text, setText] = useState("");
  const [model, setModel] = useState<GeoModel>("chatgpt");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LiveResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card
      title="今すぐ実行（オンデマンド）"
      description="定期計測を待たずにその場で 1 回聞きます。実行が速い代わりに原価が約 3 倍なので、消費は 2 クレジットです。定期計測は常に安い標準キューで動きます。"
      actions={<Badge tone="neutral" icon={false}>残り {balance} クレジット</Badge>}
    >
      {error && <Callout tone="fail" className="mb-3">{error}</Callout>}
      <div className="flex flex-wrap items-end gap-3">
        <Field label="プロンプト" className="min-w-[18rem] flex-1">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="おすすめの SEO ツールは？" />
        </Field>
        <Field label="モデル">
          <select
            className="rounded-sm border border-line bg-panel px-3 py-2 text-[13px] text-ink"
            value={model}
            onChange={(e) => setModel(e.target.value as GeoModel)}
          >
            {GEO_LLM_MODELS.map((m) => (
              <option key={m} value={m}>
                {GEO_MODEL_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
        <Button
          size="sm"
          loading={busy}
          disabled={!text.trim() || balance < 2}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setResult(await runLive(text.trim(), model));
            } catch (err) {
              setError(err instanceof Error ? err.message : "実行できませんでした");
            } finally {
              setBusy(false);
            }
          }}
        >
          実行する（2 クレジット）
        </Button>
      </div>

      {result && (
        <div className="mt-4 space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            {result.mentioned.map((m) => (
              <Badge key={m.brandId} tone={m.mentioned ? "pass" : "neutral"} icon={false}>
                {m.displayName}: {m.mentioned ? `言及あり（確信度 ${Math.round(m.confidence * 100)}%）` : "言及なし"}
              </Badge>
            ))}
          </div>
          <div className="whitespace-pre-wrap rounded-sm border border-line bg-surface p-3 leading-relaxed text-ink">{result.responseText || "（本文が空でした）"}</div>
          {result.citations.length > 0 && (
            <ul className="space-y-1 text-[12px]">
              {result.citations.map((c) => (
                <li key={c.url}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline-offset-2 hover:underline">
                    {c.unresolved ? "（解決できなかったリンク）" : c.domain}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

function VersionsCard({ versions }: { versions: DashboardResponse["versions"] }) {
  return (
    <Card
      title="モデルの更新"
      description="AI 側のモデルが入れ替わると、引用の傾向が階段状に変わることがあります。観測数を増やしても平滑化できないので、変化の説明としてここに記録します。"
    >
      <ul className="divide-y divide-line border-y border-line">
        {versions.map((v) => (
          <li key={`${v.model}-${v.detectedAt}`} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
            <span className="font-bold text-ink">{GEO_MODEL_LABELS[v.model] ?? v.model}</span>
            <span className="text-muted">
              {v.versionFrom ?? "（不明）"} → {v.versionTo}
            </span>
            <span className="ml-auto text-[11px] tabular-nums text-muted">{new Date(v.detectedAt).toLocaleDateString("ja-JP")}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
