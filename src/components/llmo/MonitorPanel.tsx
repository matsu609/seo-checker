"use client";

/**
 * 定点モニタリング（B4）。登録プロンプト × 対象モデルを実行し、
 * ブランド言及率・ドメイン引用率の推移とランキング・競合比較を出す。
 */
import { useId, useMemo, useState } from "react";
import { LineChart, LineChartLegend } from "./LineChart";
import { MarkMatrix } from "./Mark";
import { AnswerCard } from "./AnswerCard";
import { ModelPicker } from "./ModelPicker";
import {
  Badge,
  Button,
  Callout,
  Card,
  DataTable,
  EmptyState,
  Field,
  StatCard,
  Tabs,
  Textarea,
  type Column,
} from "@/components/ui";
import { downloadCsv, csvFileName } from "@/lib/export/csv";
import type { IntegrationStatus } from "@/lib/features/integrations";
import {
  comparisonMatrix,
  kpi,
  latestDate,
  promptRows,
  ranking,
  seriesByEntity,
  seriesByProvider,
  unclassifiedTop,
  type LlmoMetric,
  type PromptRow,
  type RankingRow,
} from "@/lib/llmo/aggregate";
import { providerLabel } from "@/lib/llmo/providers/meta";
import {
  addPrompts,
  llmoPromptsStore,
  llmoRunsStore,
  monitorRuns,
  promptsForProject,
  removePrompt,
  saveRuns,
  toStoredRun,
  togglePrompt,
  type LlmoPrompt,
} from "@/lib/llmo/store";
import { MAX_CALLS_PER_REQUEST, type LlmoEntity, type LlmoRun, type LlmoRunResponse, type ProviderId } from "@/lib/llmo/types";
import { formatRate } from "@/lib/rank/classify";
import { newId, updateProject, type Project } from "@/lib/store";
import { useStore } from "@/lib/store/hooks";
import { useToolRun } from "@/lib/tools/run";
import { palette } from "@/lib/ui/palette";

export interface MonitorPanelProps {
  project: Project | null;
  entities: LlmoEntity[];
  models: ProviderId[];
  onModelsChange: (models: ProviderId[]) => void;
  status: IntegrationStatus | null;
  /** 実行できるか（ANTHROPIC_API_KEY などが設定済みか） */
  canRun: boolean;
}

type SeriesMode = "entity" | "provider";

export function MonitorPanel({ project, entities, models, onModelsChange, status, canRun }: MonitorPanelProps) {
  const id = useId();
  const [allPrompts] = useStore(llmoPromptsStore);
  const [allRuns] = useStore(llmoRunsStore);
  const [draft, setDraft] = useState("");
  const [metric, setMetric] = useState<LlmoMetric>("brand");
  const [seriesMode, setSeriesMode] = useState<SeriesMode>("entity");
  const [notice, setNotice] = useState<string | null>(null);
  const run = useToolRun<LlmoRunResponse>();

  const projectId = project?.id ?? "";
  const prompts = useMemo(() => promptsForProject(allPrompts, projectId), [allPrompts, projectId]);
  const activePrompts = useMemo(() => prompts.filter((p) => p.active), [prompts]);
  const runs = useMemo(() => monitorRuns(allRuns, projectId), [allRuns, projectId]);
  const selfEntity = entities.find((e) => e.isSelf) ?? null;
  const selfId = selfEntity?.id ?? null;

  const latest = latestDate(runs);
  const stats = useMemo(() => kpi(runs, selfId), [runs, selfId]);
  const latestStats = useMemo(() => kpi(runs, selfId, latest ?? undefined), [runs, selfId, latest]);
  const chart = useMemo(
    () =>
      seriesMode === "entity"
        ? seriesByEntity(runs, entities, metric, palette.chart)
        : seriesByProvider(runs, selfId, metric, palette.chart),
    [seriesMode, runs, entities, metric, selfId],
  );
  const rankRows = useMemo(() => ranking(runs, entities, latest), [runs, entities, latest]);
  const matrix = useMemo(() => comparisonMatrix(runs, entities, latest), [runs, entities, latest]);
  const unclassified = useMemo(() => unclassifiedTop(runs, 10), [runs]);
  const byPrompt = useMemo(() => promptRows(runs, selfId), [runs, selfId]);
  const latestRuns = useMemo(
    () => (latest ? runs.filter((r) => r.takenOn === latest) : []).slice(0, 40),
    [runs, latest],
  );

  const calls = activePrompts.length * models.length;
  const runnable = canRun && activePrompts.length > 0 && models.length > 0 && calls <= MAX_CALLS_PER_REQUEST;

  function addFromDraft() {
    const lines = draft
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;
    const created = addPrompts(lines, { projectId });
    setDraft("");
    setNotice(
      created.length === lines.length
        ? `${created.length} 件のプロンプトを登録しました。`
        : `${created.length} 件を登録しました（${lines.length - created.length} 件は登録済みのため省きました）。`,
    );
  }

  async function execute() {
    setNotice(null);
    if (!runnable) return;
    const data = await run.run("/api/llmo/run", {
      prompts: activePrompts.map((p) => ({ id: p.id, text: p.text })),
      models,
      entities,
    });
    if (!data) return;
    const stored: LlmoRun[] = data.rows.map((row) =>
      toStoredRun(row, { projectId, takenOn: data.takenOn, measuredAt: data.measuredAt }),
    );
    saveRuns(stored);
    const failed = stored.filter((r) => r.status === "error").length;
    setNotice(
      [
        `${data.takenOn} に ${stored.length} 件を記録しました`,
        failed > 0 ? `（うち ${failed} 件は失敗）` : "",
        data.skipped.length > 0 ? `。${data.skipped.map((s) => `${providerLabel(s.providerId)}: ${s.reason}`).join(" / ")}` : "",
      ].join(""),
    );
  }

  function addCompetitor(domain: string) {
    if (!project) return;
    if (project.competitors.some((c) => c.domains.includes(domain))) return;
    updateProject(project.id, {
      competitors: [...project.competitors, { id: newId(), name: domain, domains: [domain], brandAliases: [] }],
    });
    setNotice(`${domain} を競合として登録しました。次回の集計から未分類ではなくなります。`);
  }

  function exportCsv() {
    const rows = runs.flatMap((r) =>
      r.judgements.map((j) => ({
        takenOn: r.takenOn,
        prompt: r.promptText,
        model: providerLabel(r.providerId),
        modelId: r.model,
        status: r.status,
        entity: entities.find((e) => e.id === j.entityId)?.name ?? j.entityId,
        brand: j.brandMentioned,
        domain: j.domainCited,
        matched: j.matchedDomains.join(" "),
      })),
    );
    downloadCsv(
      csvFileName("llmo-monitoring", new Date()),
      [
        { header: "日付", value: (r) => r.takenOn },
        { header: "プロンプト", value: (r) => r.prompt },
        { header: "モデル", value: (r) => r.model },
        { header: "モデルID", value: (r) => r.modelId },
        { header: "状態", value: (r) => (r.status === "ok" ? "成功" : "失敗") },
        { header: "会社", value: (r) => r.entity },
        { header: "ブランド言及", value: (r) => (r.brand ? "○" : "×") },
        { header: "ドメイン引用", value: (r) => (r.domain ? "○" : "×") },
        { header: "一致ドメイン", value: (r) => r.matched },
      ],
      rows,
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="先にプロジェクトを登録してください"
        description="自社ドメインとブランド表記（別名）、競合を設定画面で登録すると、回答内の言及と引用元を自動で判定できます。"
      />
    );
  }

  const promptColumns: Column<LlmoPrompt>[] = [
    {
      key: "active",
      header: "対象",
      width: "4rem",
      align: "center",
      render: (row) => (
        <input
          type="checkbox"
          aria-label={`${row.text} を対象にする`}
          className="h-4 w-4 accent-accent"
          checked={row.active}
          onChange={(e) => togglePrompt(row.id, e.target.checked)}
        />
      ),
    },
    {
      key: "text",
      header: "プロンプト",
      render: (row) => (
        <span className="text-ink">
          {row.text}
          {row.category && (
            <Badge tone="neutral" className="ml-1.5">
              {row.category}
            </Badge>
          )}
        </span>
      ),
      accessor: (row) => row.text,
      sortable: true,
    },
    {
      key: "remove",
      header: "",
      width: "5rem",
      align: "right",
      render: (row) => (
        <Button variant="ghost" size="sm" onClick={() => removePrompt(row.id)}>
          削除
        </Button>
      ),
    },
  ];

  const rankColumns = (key: LlmoMetric): Column<RankingRow>[] => [
    {
      key: "name",
      header: "会社",
      render: (row, i) => (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-[11px] text-muted tabular-nums">{i + 1}.</span>
          <span className={row.isSelf ? "font-bold text-ink" : "text-ink"}>{row.name}</span>
          {row.isSelf && <Badge tone="free">自社</Badge>}
        </span>
      ),
    },
    {
      key: "rate",
      header: key === "brand" ? "ブランド言及率" : "ドメイン引用率",
      align: "right",
      width: "9rem",
      render: (row) => {
        const value = key === "brand" ? row.brandRate : row.domainRate;
        return value === null ? "—" : formatRate(value);
      },
    },
  ];

  const promptStatColumns: Column<PromptRow>[] = [
    { key: "prompt", header: "プロンプト", accessor: (r) => r.promptText, sortable: true },
    {
      key: "brand",
      header: "ブランド言及率",
      align: "right",
      width: "8rem",
      accessor: (r) => r.brandRate ?? -1,
      sortable: true,
      render: (r) => (r.brandRate === null ? "—" : formatRate(r.brandRate)),
    },
    {
      key: "domain",
      header: "ドメイン引用率",
      align: "right",
      width: "8rem",
      accessor: (r) => r.domainRate ?? -1,
      sortable: true,
      render: (r) => (r.domainRate === null ? "—" : formatRate(r.domainRate)),
    },
    { key: "calls", header: "回答数", align: "right", width: "6rem", accessor: (r) => r.calls, sortable: true },
    {
      key: "failed",
      header: "失敗",
      align: "right",
      width: "5rem",
      accessor: (r) => r.failed,
      render: (r) => (r.failed > 0 ? <span className="text-fail">{r.failed}</span> : "—"),
    },
  ];

  return (
    <div className="space-y-6">
      <Card
        title="モニタリングするプロンプト"
        description="AI に実際に打たれそうな質問を登録します。1 行 1 プロンプト。API キーが無くても登録だけ先に進められます。"
        actions={<Badge tone="neutral">{prompts.length} 件登録／{activePrompts.length} 件を対象</Badge>}
      >
        <Field
          label="プロンプトを追加"
          htmlFor={`${id}-draft`}
          hint="例: SEO ツールのおすすめを教えて／AIO 対策は何から始めればいい？"
        >
          <Textarea
            id={`${id}-draft`}
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={"SEO ツールのおすすめを教えて\nAIO 対策は何から始めればいい？"}
          />
        </Field>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={addFromDraft} disabled={draft.trim().length === 0}>
            登録する
          </Button>
          <span className="text-[12px] text-muted">
            プロンプト拡張ツールで作ったプロンプトをまとめて登録することもできます。
          </span>
        </div>
        {prompts.length > 0 && (
          <div className="mt-4">
            <DataTable rows={prompts} columns={promptColumns} rowKey={(r) => r.id} dense minWidth="30rem" />
          </div>
        )}
      </Card>

      <Card
        title="実行"
        description="選んだモデルに登録プロンプトを投げ、その日の結果として保存します。1 日 1 回の実行を想定しています。"
        actions={
          <>
            <Button onClick={() => void execute()} loading={run.state.phase === "running"} disabled={!runnable}>
              いま実行する
            </Button>
            {run.state.phase === "running" && (
              <Button variant="secondary" onClick={run.cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <ModelPicker value={models} onChange={onModelsChange} status={status} disabled={run.state.phase === "running"} />
        <p className="mt-3 text-[12px] text-muted">
          今回の呼び出し数: {activePrompts.length} プロンプト × {models.length} モデル = {calls} 回
          {calls > MAX_CALLS_PER_REQUEST && (
            <span className="ml-1 text-fail">
              （1 回の実行は {MAX_CALLS_PER_REQUEST} 回までです。対象プロンプトかモデルを減らしてください）
            </span>
          )}
        </p>
        {!canRun && (
          <p className="mt-2 text-[12px] text-muted">
            ANTHROPIC_API_KEY が未設定のため実行できません。登録済みの履歴の表示と CSV 出力は引き続き使えます。
          </p>
        )}
        {run.state.phase === "running" && (
          <p className="mt-2 text-[12px] text-muted">
            Web 検索付きの回答は 1 件あたり 10〜30 秒かかります。完了までこのページを開いたままにしてください。
          </p>
        )}
        {notice && <p className="mt-2 text-[12px] text-muted">{notice}</p>}
      </Card>

      {run.state.phase === "error" && (
        <Callout tone="fail" title="実行できませんでした">
          {run.state.message}
        </Callout>
      )}

      {runs.length === 0 ? (
        <EmptyState
          title="まだ計測結果がありません"
          description="プロンプトを登録して「いま実行する」を押すと、その日の言及率・引用率が記録されます。日を重ねるほど推移が見えるようになります。"
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatCard
              label="平均ブランド言及率（最新日）"
              value={latestStats.brandRate === null ? "—" : formatRate(latestStats.brandRate)}
              hint={latest ? `${latest} の全モデル平均` : undefined}
            />
            <StatCard
              label="平均ドメイン引用率（最新日）"
              value={latestStats.domainRate === null ? "—" : formatRate(latestStats.domainRate)}
              hint={selfEntity ? `自社: ${selfEntity.name}` : "自社が未登録です"}
            />
            <StatCard label="記録日数" value={stats.days} unit="日" hint={`回答 ${stats.calls} 件`} />
            <StatCard
              label="失敗した呼び出し"
              value={stats.failed}
              unit="件"
              hint={stats.failed > 0 ? "集計の分母からは除いています" : "すべて成功しています"}
            />
          </div>

          <Card
            title="推移"
            description="取得に失敗した日は線を切って描きます（前日の値を引き継ぎません）。"
            actions={
              <div className="flex flex-wrap gap-2">
                <Tabs
                  ariaLabel="指標"
                  tabs={[
                    { id: "brand", label: "ブランド言及率" },
                    { id: "domain", label: "ドメイン引用率" },
                  ]}
                  value={metric}
                  onChange={(v) => setMetric(v as LlmoMetric)}
                />
                <Tabs
                  ariaLabel="集計軸"
                  tabs={[
                    { id: "entity", label: "会社別" },
                    { id: "provider", label: "モデル別" },
                  ]}
                  value={seriesMode}
                  onChange={(v) => setSeriesMode(v as SeriesMode)}
                />
              </div>
            }
          >
            {chart.dates.length === 0 || chart.series.length === 0 ? (
              <p className="text-[13px] text-muted">描画できるデータがありません。</p>
            ) : (
              <>
                <LineChart
                  dates={chart.dates}
                  series={chart.series}
                  ariaLabel={`${seriesMode === "entity" ? "会社別" : "モデル別"}の${metric === "brand" ? "ブランド言及率" : "ドメイン引用率"}の推移`}
                />
                <LineChartLegend series={chart.series} />
                {seriesMode === "provider" && !selfId && (
                  <p className="mt-2 text-[12px] text-muted">自社が未登録のためモデル別の推移を描けません。</p>
                )}
              </>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="ブランド言及率ランキング" headingLevel={3} description={latest ? `${latest} 時点` : undefined}>
              <DataTable
                rows={[...rankRows].sort((a, b) => (b.brandRate ?? -1) - (a.brandRate ?? -1))}
                columns={rankColumns("brand")}
                rowKey={(r) => r.entityId}
                dense
              />
            </Card>
            <Card title="ドメイン引用率ランキング" headingLevel={3} description={latest ? `${latest} 時点` : undefined}>
              <DataTable
                rows={[...rankRows].sort((a, b) => (b.domainRate ?? -1) - (a.domainRate ?? -1))}
                columns={rankColumns("domain")}
                rowKey={(r) => r.entityId}
                dense
              />
            </Card>
          </div>

          <Card
            title="競合比較"
            description="最新日の結果。1 つでも言及・引用があれば ○ です。"
            actions={<Badge tone="neutral">{latest ?? "—"}</Badge>}
          >
            <MarkMatrix providers={matrix.providers} rows={matrix.rows} />
          </Card>

          <Card
            title="未分類ドメイン Top10"
            description="引用されたのに、自社にも登録済みの競合にも一致しなかったドメインです。競合として登録すると次回から集計されます。"
          >
            {unclassified.length === 0 ? (
              <p className="text-[13px] text-muted">未分類の引用ドメインはありません。</p>
            ) : (
              <ul className="space-y-1">
                {unclassified.map((u) => (
                  <li key={u.domain} className="flex flex-wrap items-center gap-2 border-b border-line py-1.5 last:border-0">
                    <a
                      href={u.sampleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 break-all text-[13px] text-accent underline-offset-2 hover:underline"
                    >
                      {u.domain}
                    </a>
                    <span className="text-[12px] text-muted tabular-nums">{u.count} 回</span>
                    <Button variant="secondary" size="sm" onClick={() => addCompetitor(u.domain)}>
                      競合に追加
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="プロンプト別の内訳"
            description="自社の言及率・引用率をプロンプトごとに見ます。"
            actions={
              <Button variant="secondary" size="sm" onClick={exportCsv}>
                CSV ダウンロード
              </Button>
            }
          >
            <DataTable rows={byPrompt} columns={promptStatColumns} rowKey={(r) => r.promptId} minWidth="42rem" />
          </Card>

          <Card title="最新日の回答原文" description={latest ? `${latest} に取得した回答（最大 40 件）` : undefined}>
            <div className="space-y-2">
              {latestRuns.map((r) => (
                <AnswerCard key={r.id} run={r} entities={entities} />
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
