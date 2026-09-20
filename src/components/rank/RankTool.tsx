"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RankAutoResponse } from "@/app/api/rank/auto/route";
import { Badge, Button, Callout, Card, Select, StatStrip, Tabs } from "@/components/ui";
import { downloadCsv, csvFileName, type CsvColumn } from "@/lib/export/csv";
import {
  AIO_CLASS_LABELS,
  RANK_DIRECTION_SYMBOLS,
  dateKey,
  formatRate,
  storedDates,
  summarizeAioClasses,
} from "@/lib/rank/classify";
import { buildRankRows, rankText, type RankRow } from "@/lib/rank/rows";
import {
  DEVICE_LABELS,
  filterKeywords,
  rankGroupsStore,
  rankKeywordsStore,
  rankSnapshotsStore,
  saveSnapshots,
  toSnapshot,
  type RankSnapshot,
} from "@/lib/rank/store";
import type { RankMeasureFailure, RankMeasureResponse } from "@/lib/rank/types";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { KeywordsTool } from "@/components/keywords/KeywordsTool";
import { SearchEstimateTool } from "@/components/search-estimate/SearchEstimateTool";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";
import { AioPanel } from "./AioPanel";
import { KeywordRegistry } from "./KeywordRegistry";
import { RankTable } from "./RankTable";
import { RankTrendPanel } from "./RankTrendPanel";
import { RealtimePanel } from "./RealtimePanel";
import { formatDateTime } from "@/lib/report/format";

type TabId = "keywords" | "trend" | "realtime" | "aio" | "estimate" | "research";

const CSV_COLUMNS: CsvColumn<RankRow>[] = [
  { header: "キーワード", value: (r) => r.keyword.keyword },
  { header: "デバイス", value: (r) => DEVICE_LABELS[r.keyword.device] },
  { header: "グループ", value: (r) => r.groupName ?? "" },
  { header: "地域", value: (r) => r.keyword.location ?? "" },
  { header: "月間検索数", value: (r) => r.keyword.monthlyVolume ?? "" },
  { header: "基準日", value: (r) => r.current?.takenOn ?? "" },
  { header: "順位", value: (r) => rankText(r.currentRank) },
  { header: "前回日", value: (r) => r.previous?.takenOn ?? "" },
  { header: "前回順位", value: (r) => rankText(r.previousRank) },
  {
    header: "変化",
    value: (r) =>
      `${RANK_DIRECTION_SYMBOLS[r.delta.direction]}${r.delta.diff !== null && r.delta.diff !== 0 ? Math.abs(r.delta.diff) : ""}`,
  },
  { header: "ランディングページ", value: (r) => r.current?.url ?? "" },
  { header: "AI概要", value: (r) => (r.aioClass ? AIO_CLASS_LABELS[r.aioClass] : "未取得") },
  { header: "AIO引用サイト数", value: (r) => r.current?.aiOverview.references.length ?? "" },
];

/** 順位計測・AI Overviews 引用（B1 / B2 / B3）の画面 */
export function RankTool() {
  const { status } = useIntegrations();
  const serpEnabled = status?.serpapi === true;
  const { project, projects } = useCurrentProject();
  const [keywords] = useStore(rankKeywordsStore);
  const [groups] = useStore(rankGroupsStore);
  const [snapshots] = useStore(rankSnapshotsStore);

  const [tab, setTab] = useState<TabId>("keywords");
  const [groupId, setGroupId] = useState("");
  const [currentDate, setCurrentDate] = useState("");
  const [previousDate, setPreviousDate] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failures, setFailures] = useState<RankMeasureFailure[]>([]);
  const [auto, setAuto] = useState<RankAutoResponse | null>(null);
  const { state, run, cancel } = useToolRun<RankMeasureResponse>();

  // 毎週の自動計測（サーバー保存）を端末側の履歴に取り込む（同じ語・同じ日は後勝ち）
  useEffect(() => {
    const ac = new AbortController();
    fetch("/api/rank/auto", { cache: "no-store", signal: ac.signal })
      .then(async (r) => (r.ok ? ((await r.json()) as RankAutoResponse) : null))
      .then((body) => {
        if (!body || ac.signal.aborted) return;
        setAuto(body);
        if (body.snapshots.length > 0) saveSnapshots(body.snapshots);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  const projectId = project?.id ?? "";
  const projectDomain = project?.domain ?? "";
  const competitorDomains = useMemo(
    () => (project?.competitors ?? []).flatMap((c) => c.domains).filter(Boolean),
    [project],
  );

  const scoped = useMemo(
    () => filterKeywords(keywords, { projectId: projectId || null }),
    [keywords, projectId],
  );
  const visible = useMemo(
    () => (groupId ? scoped.filter((k) => k.groupId === groupId) : scoped),
    [scoped, groupId],
  );
  const visibleIds = useMemo(() => new Set(visible.map((k) => k.id)), [visible]);
  const visibleSnapshots = useMemo(
    () => snapshots.filter((s) => visibleIds.has(s.keywordId)),
    [snapshots, visibleIds],
  );
  const dates = useMemo(() => storedDates(visibleSnapshots).reverse(), [visibleSnapshots]);

  const rows = useMemo(
    () =>
      buildRankRows(visible, visibleSnapshots, groups, {
        currentDate: currentDate || null,
        previousDate: previousDate || null,
      }),
    [visible, visibleSnapshots, groups, currentDate, previousDate],
  );

  const summary = useMemo(() => summarizeAioClasses(rows.map((r) => r.aioClass), rows.length), [rows]);
  const measuredCount = rows.filter((r) => r.currentRank !== undefined).length;
  const top10 = rows.filter((r) => typeof r.currentRank === "number" && r.currentRank <= 10).length;
  const outOfRange = rows.filter((r) => r.currentRank === null).length;

  const canMeasure = serpEnabled && Boolean(projectDomain) && visible.length > 0;

  async function measureAll() {
    setFailures([]);
    const targets = visible;
    if (targets.length === 0) return;
    const data = await run("/api/rank/measure", {
      keywords: targets.map((k) => ({
        keyword: k.keyword,
        device: k.device,
        ...(k.location ? { location: k.location } : {}),
      })),
      projectDomain,
      competitorDomains,
      includeAioText: true,
    });
    if (!data) return;
    const takenOn = dateKey();
    const saved: RankSnapshot[] = [];
    const failed: RankMeasureFailure[] = [];
    for (const item of data.results) {
      if (!item.ok) {
        failed.push(item);
        continue;
      }
      const keyword = targets.find((k) => k.keyword === item.keyword && k.device === item.device);
      if (keyword) saved.push(toSnapshot(keyword.id, item, takenOn));
    }
    saveSnapshots(saved);
    setFailures(failed);
    setCurrentDate("");
    setPreviousDate("");
  }

  // 2026-09-19: 「検索の推定」と「キーワード調査」を別タブから取り込んだ（利用者の決定）。
  // どれも「どの語で何位か」を扱う仕事で、画面が分かれている必要がなかった
  const tabs = [
    { id: "keywords" as const, label: "キーワード", count: scoped.length },
    { id: "trend" as const, label: "推移" },
    { id: "realtime" as const, label: "リアルタイム計測" },
    { id: "aio" as const, label: "AI Overviews" },
    { id: "estimate" as const, label: "検索の推定" },
    { id: "research" as const, label: "キーワード調査" },
  ];

  return (
    <div className="space-y-6">
      {projects.length === 0 && (
        <Callout tone="info" title="ホームページの URL が未登録です">
          ホームページと競合を登録すると、順位と AI Overviews の引用を自社・競合で判定できます。
          <Link href="/settings" className="ml-1 font-bold text-accent underline-offset-2 hover:underline">
            設定画面で登録する
          </Link>
        </Callout>
      )}

      <Card
        title="計測対象"
        description={
          project
            ? `ホームページ「${project.name}」（${project.domain}）／ 競合 ${competitorDomains.length} ドメイン`
            : "ホームページが未登録のため、キーワードの登録のみ利用できます。"
        }
        actions={
          <>
            <Button
              onClick={() => void measureAll()}
              loading={state.phase === "running"}
              disabled={!canMeasure}
              title={
                !serpEnabled
                  ? "SERPAPI_KEY が未設定のため計測できません"
                  : !projectDomain
                    ? "設定画面でホームページの URL を登録してください"
                    : visible.length === 0
                      ? "計測するキーワードがありません"
                      : undefined
              }
            >
              {groupId ? "このグループを計測する" : "すべて計測する"}
            </Button>
            {state.phase === "running" && (
              <Button variant="secondary" onClick={cancel}>
                中止
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => downloadCsv(csvFileName("rank", new Date()), CSV_COLUMNS, rows)}
              disabled={rows.length === 0}
            >
              CSV
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[13px]">
            <span className="mb-1 block font-bold text-ink">グループ</span>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="h-9 w-44 text-[13px]">
              <option value="">すべて（{scoped.length} 件）</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block font-bold text-ink">比較する日</span>
            <Select
              value={currentDate}
              onChange={(e) => setCurrentDate(e.target.value)}
              className="h-9 w-40 text-[13px]"
              disabled={dates.length === 0}
            >
              <option value="">最新</option>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[13px]">
            <span className="mb-1 block font-bold text-ink">比較先の日</span>
            <Select
              value={previousDate}
              onChange={(e) => setPreviousDate(e.target.value)}
              className="h-9 w-40 text-[13px]"
              disabled={dates.length === 0}
            >
              <option value="">1 つ前</option>
              {dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
          {(currentDate || previousDate) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCurrentDate("");
                setPreviousDate("");
              }}
            >
              比較をリセット
            </Button>
          )}
          {!serpEnabled && <Badge tone="neutral">計測は要設定</Badge>}
        </div>

        <StatStrip
          className="mt-5"
          items={[
            { label: "対象キーワード", value: visible.length, unit: "件" },
            { label: "計測済み", value: measuredCount, unit: "件" },
            { label: "10 位以内", value: top10, unit: "件" },
            { label: "圏外", value: outOfRange, unit: "件" },
            { label: "AIO 出現率", value: formatRate(summary.presenceRate) },
          ]}
        />
        <p className="mt-2 text-[11px] text-muted">
          AIO 出現率 = AI による概要が表示されたキーワード数 ÷ 計測できたキーワード数。未取得のキーワードは分母から外すため、
          「対象キーワード」と「計測済み」の差で未取得の件数を確認できます。
        </p>
      </Card>

      {auto && (
        <Callout tone="info" title="毎週火曜 5:00 に自動で計測します">
          登録キーワードのうち登録が古い順に {auto.limit} 語まで（プランで決まります）を、SerpApi で測って履歴に足します。
          次回 {formatDateTime(auto.nextRunAt)}。
          {auto.lastRunDate ? `最後の自動計測は ${auto.lastRunDate} です。` : "まだ自動計測は動いていません。"}
          {!auto.enabled && " いまは自動計測の準備ができていません（運用側の設定待ち）。"}
          前回より 5 位以上下がった語・10 位以内から外れた語・圏外になった語は「お知らせ」（設定でメールも可）で知らせます。
        </Callout>
      )}

      {state.phase === "error" && (
        <Callout tone="fail" title="計測できませんでした">
          {state.message}
        </Callout>
      )}
      {failures.length > 0 && (
        <Callout tone="warn" title={`${failures.length} 件のキーワードで取得に失敗しました`}>
          <ul className="mt-1 space-y-0.5 text-[13px]">
            {failures.map((f) => (
              <li key={`${f.keyword}:${f.device}`}>
                {f.keyword}（{DEVICE_LABELS[f.device]}）: {f.error}
              </li>
            ))}
          </ul>
        </Callout>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="順位計測の表示切り替え" />

      {tab === "keywords" && (
        <div className="space-y-4">
          <Card
            title="順位一覧"
            headingLevel={3}
            description={
              currentDate || previousDate
                ? `${currentDate || "最新"} と ${previousDate || "1 つ前"} を比較しています。取得していない日は「未取得」と表示します。`
                : "最新の計測結果と 1 つ前を比較しています。"
            }
          >
            <RankTable
              rows={rows}
              currentLabel={currentDate || "最新順位"}
              previousLabel={previousDate || "前回"}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setTab("aio");
              }}
              emptyText={
                scoped.length === 0
                  ? "キーワードが登録されていません。下のフォームから追加してください。"
                  : "このグループにキーワードがありません。"
              }
            />
          </Card>
          <KeywordRegistry projectId={projectId} keywords={scoped} groups={groups} />
        </div>
      )}

      {tab === "trend" && (
        <Card title="順位の推移" headingLevel={3} description="手動の計測と毎週の自動計測を同じ線に並べます。上が 1 位。">
          <RankTrendPanel keywords={visible} snapshots={visibleSnapshots} />
        </Card>
      )}

      {tab === "realtime" && (
        <RealtimePanel
          projectId={projectId}
          projectDomain={projectDomain}
          competitorDomains={competitorDomains}
          serpEnabled={serpEnabled}
          keywords={scoped}
        />
      )}

      {tab === "aio" && (
        <AioPanel
          keywords={visible}
          snapshots={visibleSnapshots}
          projectDomain={projectDomain}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      {tab === "estimate" && (
        <div className="space-y-4">
          <Callout tone="info" title="登録していない語も含めて、いま順位がある語を洗い出します">
            上の「キーワード」タブは登録した語の定点観測です。こちらは、そのドメインが**すでに順位を持っている語**を自動で集めて、推定の表示回数・クリック数を出します。育てる語を見つけたら「キーワード」タブに登録してください。
          </Callout>
          <SearchEstimateTool />
        </div>
      )}

      {tab === "research" && (
        <div className="space-y-4">
          <Callout tone="info" title="これから狙う語を探します">
            種になる語から Google サジェスト・関連キーワードを広げ、検索意図で分類します。良さそうな語はそのまま「キーワード」タブに登録できます。
          </Callout>
          <KeywordsTool />
        </div>
      )}
    </div>
  );
}
