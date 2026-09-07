"use client";

import { useId, useMemo, useState } from "react";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, Select, StatCard } from "@/components/ui";
import {
  aggregateTopics,
  missingTopics,
  missingTopicsText,
  splitByPeriod,
} from "@/lib/aio-topics/aggregate";
import { mapCoverageToTopics } from "@/lib/aio-topics/normalize";
import {
  aioTopicCoverageStore,
  aioTopicDaysStore,
  aioTopicDictStore,
  aioTopicSettingsStore,
  coverageMap,
  daysForKeyword,
  removeKeywordData,
  saveCoverage,
  saveExtraction,
  storedKeywords,
  topicsForKeyword,
} from "@/lib/aio-topics/store";
import type { AioTopicsResponse, CoverageResponse } from "@/lib/aio-topics/types";
import { formatRate } from "@/lib/rank/classify";
import { DEVICE_LABELS, rankKeywordsStore } from "@/lib/rank/store";
import type { SerpDevice } from "@/lib/rank/types";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";
import { TopicTable } from "./TopicTable";

/** 集計期間の選択肢（0 = 全期間） */
const PERIODS = [
  { value: 0, label: "全期間" },
  { value: 7, label: "直近 7 回" },
  { value: 14, label: "直近 14 回" },
  { value: 30, label: "直近 30 回" },
];

/** AIO 頻出トピック（A5）の画面 */
export function AioTopicsTool() {
  const id = useId();
  const { status } = useIntegrations();
  const serpEnabled = status?.serpapi === true;
  const anthropicEnabled = status?.anthropic === true;
  const { project } = useCurrentProject();

  const [settings, setSettings] = useStore(aioTopicSettingsStore);
  const [dict] = useStore(aioTopicDictStore);
  const [days] = useStore(aioTopicDaysStore);
  const [coverageRecords] = useStore(aioTopicCoverageStore);
  const [rankKeywords] = useStore(rankKeywordsStore);

  const [period, setPeriod] = useState(0);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const extract = useToolRun<AioTopicsResponse>();
  const coverage = useToolRun<CoverageResponse>();

  const keyword = settings.keyword.trim();
  const pageUrl = settings.pageUrl.trim();

  const history = useMemo(() => daysForKeyword(days, keyword), [days, keyword]);
  const topics = useMemo(() => topicsForKeyword(dict, keyword), [dict, keyword]);
  const coverageByTopic = useMemo(
    () => (pageUrl ? coverageMap(coverageRecords, keyword, pageUrl) : {}),
    [coverageRecords, keyword, pageUrl],
  );
  const aggregate = useMemo(() => {
    const { currentDays, previousDays } = splitByPeriod(history, period || undefined);
    return aggregateTopics({ days: currentDays, previousDays, topics, coverage: coverageByTopic });
  }, [history, period, topics, coverageByTopic]);
  const missing = useMemo(() => missingTopics(aggregate.rows), [aggregate.rows]);

  const monthlyVolume = useMemo(() => {
    const found = rankKeywords.find((k) => k.keyword === keyword && typeof k.monthlyVolume === "number");
    return found?.monthlyVolume ?? null;
  }, [rankKeywords, keyword]);

  const knownKeywords = useMemo(() => {
    const set = new Set<string>([...storedKeywords(days), ...rankKeywords.map((k) => k.keyword)]);
    return Array.from(set);
  }, [days, rankKeywords]);

  const lastResult = extract.state.phase === "done" ? extract.state.data : null;
  const canExtract = serpEnabled && anthropicEnabled && keyword.length > 0;
  const canJudge = anthropicEnabled && pageUrl.length > 0 && aggregate.rows.length > 0;

  async function runExtract() {
    setNotice(null);
    if (!keyword) return;
    const data = await extract.run("/api/aio-topics", {
      keyword,
      device: settings.device,
      ...(settings.location.trim() ? { location: settings.location.trim() } : {}),
      ...(project?.domain ? { projectDomain: project.domain } : {}),
    });
    if (!data) return;
    saveExtraction({
      keyword,
      takenOn: data.takenOn,
      aioPresent: data.aioPresent,
      selfCited: data.selfCited,
      topics: data.topics,
    });
    setNotice(
      data.aioPresent
        ? `${data.takenOn} の AI による概要から ${data.topics.length} 件のトピックを抽出しました。`
        : `${data.takenOn} は AI による概要が表示されませんでした（表示なしとして記録しました）。`,
    );
  }

  async function runCoverage() {
    setNotice(null);
    const labels = aggregate.rows.slice(0, 20).map((r) => r.label);
    if (labels.length === 0 || !pageUrl) return;
    const data = await coverage.run("/api/aio-topics/coverage", { keyword, pageUrl, topics: labels });
    if (!data) return;
    const mapped = mapCoverageToTopics(topics, data.judgements);
    saveCoverage(
      mapped.map((m) => ({
        keyword,
        topicId: m.topicId,
        pageUrl,
        coverage: m.coverage,
        judgedAt: new Date().toISOString(),
        ...(m.reason ? { reason: m.reason } : {}),
      })),
    );
    setNotice(`${mapped.length} 件のトピックについて自社ページのカバー状況を判定しました。`);
  }

  async function copyMissing() {
    const text = missingTopicsText(keyword, missing);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setNotice("クリップボードにコピーできませんでした。テキストを選択してコピーしてください。");
    }
  }

  return (
    <div className="space-y-6">
      <Card
        title="分析するキーワード"
        description="AI による概要の本文からトピックを抽出し、日を重ねるほど「よく出るトピック」が分かります。1 日 1 回の実行を想定しています。"
        actions={
          <>
            <Button
              onClick={() => void runExtract()}
              loading={extract.state.phase === "running"}
              disabled={!canExtract}
              title={
                !serpEnabled || !anthropicEnabled
                  ? "SERPAPI_KEY と ANTHROPIC_API_KEY の両方が必要です"
                  : !keyword
                    ? "キーワードを入力してください"
                    : undefined
              }
            >
              AI概要を取得してトピック抽出
            </Button>
            {extract.state.phase === "running" && (
              <Button variant="secondary" onClick={extract.cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_9rem_11rem]">
          <Field label="キーワード" htmlFor={`${id}-kw`} required hint="順位計測に登録済みのキーワードも選べます。">
            <Input
              id={`${id}-kw`}
              list={`${id}-known`}
              value={settings.keyword}
              onChange={(e) => setSettings({ ...settings, keyword: e.target.value })}
              placeholder="AIO 対策"
            />
            <datalist id={`${id}-known`}>
              {knownKeywords.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>
          <Field label="デバイス" htmlFor={`${id}-device`}>
            <Select
              id={`${id}-device`}
              value={settings.device}
              onChange={(e) => setSettings({ ...settings, device: e.target.value as SerpDevice })}
            >
              <option value="desktop">{DEVICE_LABELS.desktop}</option>
              <option value="mobile">{DEVICE_LABELS.mobile}</option>
            </Select>
          </Field>
          <Field label="地域（任意）" htmlFor={`${id}-loc`}>
            <Input
              id={`${id}-loc`}
              value={settings.location}
              onChange={(e) => setSettings({ ...settings, location: e.target.value })}
              placeholder="Tokyo, Japan"
            />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_9rem]">
          <Field
            label="自社の対象ページ URL（カバー判定に使用）"
            htmlFor={`${id}-page`}
            hint="このページの本文と見出しを読み、トピックごとに「記載あり / 一部のみ / 記載なし」を判定します。"
          >
            <Input
              id={`${id}-page`}
              value={settings.pageUrl}
              onChange={(e) => setSettings({ ...settings, pageUrl: e.target.value })}
              placeholder="https://example.com/blog/aio"
            />
          </Field>
          <Field label="集計期間" htmlFor={`${id}-period`}>
            <Select id={`${id}-period`} value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void runCoverage()}
            loading={coverage.state.phase === "running"}
            disabled={!canJudge}
            title={
              !anthropicEnabled
                ? "ANTHROPIC_API_KEY が未設定のため判定できません"
                : !pageUrl
                  ? "自社の対象ページ URL を入力してください"
                  : aggregate.rows.length === 0
                    ? "先にトピックを抽出してください"
                    : undefined
            }
          >
            自社ページのカバー状況を判定
          </Button>
          {history.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                removeKeywordData(keyword);
                setNotice(`「${keyword}」の履歴を削除しました。`);
              }}
            >
              このキーワードの履歴を削除
            </Button>
          )}
          <span className="text-[12px] text-muted">保存済み {history.length} 日分</span>
          {lastResult && <Badge tone="neutral">抽出モデル: {lastResult.model}</Badge>}
        </div>
        {(!serpEnabled || !anthropicEnabled) && (
          <p className="mt-3 text-[12px] text-muted">
            {!serpEnabled && !anthropicEnabled
              ? "SERPAPI_KEY と ANTHROPIC_API_KEY が未設定のため取得・抽出はできません。"
              : !serpEnabled
                ? "SERPAPI_KEY が未設定のため AI による概要を取得できません。"
                : "ANTHROPIC_API_KEY が未設定のためトピック抽出とカバー判定ができません。"}
            保存済みの履歴の表示と CSV 相当の確認は引き続き利用できます。
          </p>
        )}
        {notice && <p className="mt-2 text-[12px] text-muted">{notice}</p>}
      </Card>

      {extract.state.phase === "error" && (
        <Callout tone="fail" title="取得できませんでした">
          {extract.state.message}
        </Callout>
      )}
      {coverage.state.phase === "error" && (
        <Callout tone="fail" title="カバー判定に失敗しました">
          {coverage.state.message}
        </Callout>
      )}

      {!keyword ? (
        <EmptyState
          title="キーワードを入力してください"
          description="AI による概要が表示されるキーワードほど、この分析の効果があります。順位計測で AI概要「表示あり」のキーワードから選ぶのがおすすめです。"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="このクエリでの AIO 表示率"
              value={formatRate(aggregate.presenceRate)}
              hint={`${aggregate.aioDays} / ${aggregate.totalDays} 日で表示`}
            />
            <StatCard
              label="月間検索数"
              value={monthlyVolume === null ? "—" : monthlyVolume.toLocaleString("ja-JP")}
              hint={monthlyVolume === null ? "順位計測でキーワードに入力すると表示されます" : "順位計測に登録した値"}
            />
            <StatCard
              label="自社サイトの引用率"
              value={formatRate(aggregate.citationRate)}
              {...(aggregate.prevCitationRate !== null
                ? {
                    delta: {
                      value: Math.round((aggregate.citationRate - aggregate.prevCitationRate) * 1000) / 10,
                      unit: "pt",
                      label: "前期比",
                    },
                  }
                : {})}
              hint={project?.domain ? `自社ドメイン: ${project.domain}` : "設定画面で自社ドメインを登録してください"}
            />
          </div>

          <Card
            title="AIO のトピック"
            description="出現の割合が高く、自社ページに書けていないトピックほど優先度が上がります（優先度 5 が最優先）。"
            actions={<Badge tone="neutral">{aggregate.rows.length} 件</Badge>}
          >
            <TopicTable rows={aggregate.rows} coverageJudged={Object.keys(coverageByTopic).length > 0} />
          </Card>

          <Card
            title="不足トピック"
            description="自社ページに記載が無い（または一部のみ）トピックです。ページ診断・AI ライティングに貼り付けて使えます。"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void copyMissing()} disabled={missing.length === 0}>
                {copied ? "コピーしました" : "コピー"}
              </Button>
            }
          >
            {missing.length === 0 ? (
              <p className="text-[13px] text-muted">
                {aggregate.rows.length === 0
                  ? "まだトピックがありません。「AI概要を取得してトピック抽出」を実行してください。"
                  : "不足しているトピックはありません。"}
              </p>
            ) : (
              <ul className="space-y-2">
                {missing.map((r) => (
                  <li key={r.topicId} className="border-b border-line pb-2 text-[13px] last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-ink">{r.label}</span>
                      <Badge tone={r.coverage === "partial" ? "warn" : "fail"} icon={false}>
                        {r.coverage === "partial" ? "一部のみ" : r.coverage === "none" ? "記載なし" : "未判定"}
                      </Badge>
                      <span className="text-[12px] text-muted tabular-nums">出現 {formatRate(r.share)}</span>
                      <span className="text-[12px] text-muted">優先度 {r.priority}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {!anthropicEnabled && (
              <p className="mt-3 text-[12px] text-muted">
                自社ページのカバー判定には ANTHROPIC_API_KEY が必要です。未判定のトピックは「記載なし」と同じ重みで優先度を計算しています。
              </p>
            )}
          </Card>

          {lastResult?.references && lastResult.references.length > 0 && (
            <Card
              title="直近の AI による概要"
              headingLevel={3}
              description={`${lastResult.takenOn} に取得（${DEVICE_LABELS[lastResult.device]}）`}
            >
              {lastResult.text && (
                <p className="max-h-56 overflow-y-auto whitespace-pre-wrap border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-ink">
                  {lastResult.text}
                </p>
              )}
              <h4 className="mt-4 text-sm font-bold text-ink">引用サイト</h4>
              <ol className="mt-1 space-y-1 text-[13px]">
                {lastResult.references.map((r, i) => (
                  <li key={r.url} className="border-b border-line py-1 last:border-0">
                    <span className="mr-1 text-[11px] text-muted tabular-nums">{i + 1}.</span>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-accent underline-offset-2 hover:underline"
                    >
                      {r.title}
                    </a>
                    <span className="ml-1 text-[11px] text-muted">{r.domain}</span>
                    {project?.domain && (r.domain === project.domain || r.domain.endsWith(`.${project.domain}`)) && (
                      <Badge tone="pass" className="ml-1">
                        自社
                      </Badge>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
