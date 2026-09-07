"use client";

/**
 * 生成 AI 流入分析（B6）の画面。
 *
 * GA4 は日次の素データを返すだけで、バケット分け（日 / 週 / 月）・指標切替・
 * AI 検索率の計算は src/lib/ai-traffic/aggregate.ts が行う。
 * そのため比較単位・指標・参照元辞書の切り替えでは GA4 を叩き直さない
 * （辞書を変えたときだけ、ページ表の絞り込みのために「再取得」を勧める）。
 */
import { useMemo, useState, useSyncExternalStore } from "react";
import { Callout, Card, EmptyState } from "@/components/ui";
import { aggregateTraffic, totalsOf } from "@/lib/ai-traffic/aggregate";
import { aiSourceExtrasStore, aiTrafficSettingsStore, resolveRange } from "@/lib/ai-traffic/store";
import type { AiTrafficRequest, AiTrafficResponse } from "@/lib/ai-traffic/types";
import { formatRange } from "@/lib/ga4/period";
import { formatDateTime } from "@/lib/report";
import { useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";
import { PageTable } from "./PageTable";
import { ServiceCard } from "./ServiceCard";
import { SourceDictionary } from "./SourceDictionary";
import { TrafficControls } from "./TrafficControls";
import { TrendCard } from "./TrendCard";

const subscribeNothing = () => () => {};

/**
 * ハイドレーション後だけ true。
 * 期間のプリセットは「今日」から計算するので、ビルド時の日付を HTML に焼き付けない。
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

export function AiTrafficView() {
  const mounted = useMounted();
  const { status } = useIntegrations();
  const ga4Enabled = status?.ga4 === true;

  const [settings, setSettings] = useStore(aiTrafficSettingsStore);
  const [extras] = useStore(aiSourceExtrasStore);
  const { state, run, cancel } = useToolRun<AiTrafficResponse>();
  // 再取得の間も前回の結果を残す（グラフが一瞬消えるのを避ける）
  const [result, setResult] = useState<AiTrafficResponse | null>(null);

  const resolved = useMemo(
    () => (mounted ? resolveRange(settings) : { range: null, error: null }),
    [mounted, settings],
  );

  const running = state.phase === "running";

  async function execute(refresh: boolean) {
    if (!resolved.range || !ga4Enabled) return;
    const body: AiTrafficRequest = {
      startDate: resolved.range.startDate,
      endDate: resolved.range.endDate,
      granularity: settings.granularity,
      keyEventNames: settings.keyEventNames,
      extraSources: extras,
      ...(refresh ? { refresh: true } : {}),
    };
    const data = await run("/api/ai-traffic", body);
    if (data) setResult(data);
  }

  const buckets = useMemo(
    () =>
      result
        ? aggregateTraffic(result.daily, {
            granularity: settings.granularity,
            metric: settings.metric,
            extraSources: extras,
          })
        : [],
    [result, settings.granularity, settings.metric, extras],
  );
  const totals = useMemo(() => totalsOf(buckets), [buckets]);

  /** ページ表の絞り込みに出すサービス名（実際に行にあるものだけ） */
  const services = useMemo(() => {
    const names = new Set<string>();
    for (const row of result?.pages ?? []) if (row.service) names.add(row.service);
    return Array.from(names).sort((a, b) => a.localeCompare(b, "ja"));
  }, [result]);

  return (
    <div className="space-y-6">
      {status && !ga4Enabled && (
        <Callout tone="info" title="GA4 が未連携のためデータを取得できません">
          GA4_PROPERTY_ID（プロパティ ID）と GOOGLE_SERVICE_ACCOUNT_JSON（サービスアカウントの鍵）を設定すると、
          下の条件で GA4 Data API から実データを集計します。参照元辞書の編集は連携が無くても行えます。
        </Callout>
      )}

      <TrafficControls
        settings={settings}
        onChange={setSettings}
        range={resolved.range}
        rangeError={resolved.error}
        ga4Enabled={ga4Enabled}
        running={running}
        hasResult={result !== null}
        onRun={(refresh) => void execute(refresh)}
        onCancel={cancel}
      />

      {state.phase === "error" && (
        <Callout tone="fail" title="集計できませんでした">
          {state.message}
        </Callout>
      )}

      {result === null && !running && <AboutCard />}

      {result && (
        <>
          <p className="text-[12px] text-muted">
            {formatRange({ startDate: result.range.startDate, endDate: result.range.endDate })}
            ／ 取得日時 {formatDateTime(result.fetchedAt)}
            {result.keyEventNames.length > 0 && `／ キーイベント ${result.keyEventNames.join("・")}`}
          </p>

          {result.truncated && (
            <Callout tone="info">
              GA4 の取得上限に達したため、一部の行を取り込めていません。期間を短くすると全件を集計できます。
            </Callout>
          )}

          {buckets.length === 0 ? (
            <EmptyState
              title="この期間のデータがありません"
              description="GA4 に該当するセッションが記録されていませんでした。期間を広げるか、プロパティの設定を確認してください。"
            />
          ) : (
            <>
              <TrendCard
                buckets={buckets}
                totals={totals}
                metric={settings.metric}
                granularity={settings.granularity}
              />
              <ServiceCard
                buckets={buckets}
                totals={totals}
                metric={settings.metric}
                granularity={settings.granularity}
              />
            </>
          )}

          <PageTable rows={result.pages} keyEventNames={result.keyEventNames} services={services} />
        </>
      )}

      <SourceDictionary hasResult={result !== null} />
    </div>
  );
}

/** 実データが無いときに「何が出るのか」を説明する（ダミーのグラフは出さない） */
function AboutCard() {
  return (
    <Card title="このレポートで分かること" description="GA4 Data API の runReport を 2 本だけ呼び、次の 3 つを組み立てます。">
      <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-ink">
        <li>
          <span className="font-bold">全体 / 自然検索 / AI 検索の推移</span>
          ：日・週・月の比較単位、セッション数 / ユーザー数の切り替えに対応した積み上げ棒と、
          AI 検索率（対総セッション）・AI 検索率（対自然検索）の折れ線。
        </li>
        <li>
          <span className="font-bold">サービス別の内訳</span>
          ：参照元ホストを辞書で ChatGPT / Gemini / Perplexity / Claude / Microsoft Copilot などに置き換えた積み上げ棒。
        </li>
        <li>
          <span className="font-bold">ページ × 流入元 × キーイベントの表</span>
          ：ランディングページと参照元の組み合わせごとにセッション・ユーザー・キーイベントを並べ、
          キーイベント名で絞り込み・並び替え・CSV 出力ができます。
        </li>
      </ol>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        「AI 検索」は GA4 の参照元（sessionSource）が下の参照元辞書に一致したセッションです。
        自然検索は sessionDefaultChannelGroup が Organic Search のセッションを指します。
        GA4 は当日分が確定しないため、プリセットの期間はすべて昨日を終端にしています。
      </p>
    </Card>
  );
}
