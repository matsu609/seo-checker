"use client";

/**
 * 単発の「LLM リサーチ」。1 プロンプト × 選択モデルを即時に投げ、
 * 「調査対象テキストの言及」「調査対象サイトの引用」の 2 つの ○× 行列を出す。
 */
import { useId, useMemo, useState } from "react";
import { AnswerCard } from "./AnswerCard";
import { Mark } from "./Mark";
import { ModelPicker } from "./ModelPicker";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import type { IntegrationStatus } from "@/lib/features/integrations";
import { providerLabel } from "@/lib/llmo/providers/meta";
import {
  addResearch,
  defaultResearchName,
  llmoResearchStore,
  llmoRunsStore,
  llmoSettingsStore,
  removeResearch,
  researchRuns,
  saveRuns,
  toStoredRun,
} from "@/lib/llmo/store";
import type { LlmoEntity, LlmoRun, LlmoRunResponse, ProviderId } from "@/lib/llmo/types";
import { splitList, type Project } from "@/lib/store";
import { useStore } from "@/lib/store/hooks";
import { useToolRun } from "@/lib/tools/run";

export interface ResearchPanelProps {
  project: Project | null;
  models: ProviderId[];
  onModelsChange: (models: ProviderId[]) => void;
  status: IntegrationStatus | null;
  canRun: boolean;
}

/** 入力（対象テキスト / 対象サイト）→ 判定用のエンティティ */
export function researchEntities(texts: readonly string[], sites: readonly string[]): LlmoEntity[] {
  return [
    ...texts.map((text, i) => ({ id: `text-${i}`, name: text, domains: [], brandAliases: [text] })),
    ...sites.map((site, i) => ({ id: `site-${i}`, name: site, domains: [site], brandAliases: [] })),
  ];
}

export function ResearchPanel({ project, models, onModelsChange, status, canRun }: ResearchPanelProps) {
  const id = useId();
  const [researches] = useStore(llmoResearchStore);
  const [allRuns] = useStore(llmoRunsStore);
  // 入力はストアに残す（再読み込みで消えないように）。
  // 既定の調査名は「実行した時点」で決めるので、描画中には日付を作らない
  // （サーバーとクライアントで日付がずれるのを避けるため）。
  const [settings, setSettings] = useStore(llmoSettingsStore);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const run = useToolRun<LlmoRunResponse>();

  const name = settings.researchName;
  const setName = (v: string) => setSettings({ ...settings, researchName: v });
  const promptText = settings.researchPrompt;
  const targetText = settings.researchTargetText;
  const targetSite = settings.researchTargetSite;
  const setPromptText = (v: string) => setSettings({ ...settings, researchPrompt: v });
  const setTargetText = (v: string) => setSettings({ ...settings, researchTargetText: v });
  const setTargetSite = (v: string) => setSettings({ ...settings, researchTargetSite: v });

  /** 自社の登録情報（ブランド表記・ドメイン）を調査対象に入れる */
  function fillFromProject() {
    if (!project) return;
    setSettings({
      ...settings,
      researchTargetText: project.brandAliases.join("\n") || project.name,
      researchTargetSite: project.domain,
    });
  }

  const projectId = project?.id ?? "";
  const myResearches = useMemo(
    () => researches.filter((r) => r.projectId === projectId).slice().reverse(),
    [researches, projectId],
  );
  const current = useMemo(
    () => myResearches.find((r) => r.id === selectedId) ?? myResearches[0] ?? null,
    [myResearches, selectedId],
  );
  const currentRuns = useMemo(
    () => (current ? researchRuns(allRuns, current.id) : []),
    [allRuns, current],
  );

  const texts = splitList(targetText);
  const sites = splitList(targetSite);
  const runnable = canRun && promptText.trim().length > 0 && models.length > 0;

  async function execute() {
    if (!runnable) return;
    const entities = researchEntities(texts, sites);
    const data = await run.run("/api/llmo/run", {
      prompts: [{ id: "research", text: promptText.trim() }],
      models,
      entities,
    });
    if (!data) return;
    const research = addResearch({
      projectId,
      name: name.trim() || defaultResearchName(),
      promptText: promptText.trim(),
      models,
      targetTexts: texts,
      targetSites: sites,
    });
    const stored: LlmoRun[] = data.rows.map((row) =>
      toStoredRun(row, {
        projectId,
        takenOn: data.takenOn,
        measuredAt: data.measuredAt,
        researchId: research.id,
      }),
    );
    saveRuns(stored);
    setSelectedId(research.id);
  }

  function markOf(entityId: string, providerId: ProviderId, kind: "brand" | "domain"): boolean | null {
    const row = currentRuns.find((r) => r.providerId === providerId);
    if (!row || row.status !== "ok") return null;
    const j = row.judgements.find((x) => x.entityId === entityId);
    if (!j) return null;
    return kind === "brand" ? j.brandMentioned : j.domainCited;
  }

  function exportCsv() {
    if (!current) return;
    const rows = [
      ...current.targetTexts.map((t, i) => ({ kind: "テキスト言及", target: t, entityId: `text-${i}` })),
      ...current.targetSites.map((s, i) => ({ kind: "サイト引用", target: s, entityId: `site-${i}` })),
    ].flatMap((target) =>
      current.models.map((m) => ({
        name: current.name,
        prompt: current.promptText,
        model: providerLabel(m),
        kind: target.kind,
        target: target.target,
        result: markOf(target.entityId, m, target.kind === "テキスト言及" ? "brand" : "domain"),
      })),
    );
    downloadCsv(
      csvFileName(`llm-research-${current.name}`, new Date()),
      [
        { header: "調査名", value: (r) => r.name },
        { header: "プロンプト", value: (r) => r.prompt },
        { header: "モデル", value: (r) => r.model },
        { header: "種別", value: (r) => r.kind },
        { header: "調査対象", value: (r) => r.target },
        { header: "結果", value: (r) => (r.result === null ? "—" : r.result ? "○" : "×") },
      ],
      rows,
    );
  }

  const matrixModels = current ? current.models : [];

  function renderMatrix(kind: "brand" | "domain") {
    if (!current) return null;
    const targets =
      kind === "brand"
        ? current.targetTexts.map((t, i) => ({ label: t, entityId: `text-${i}` }))
        : current.targetSites.map((s, i) => ({ label: s, entityId: `site-${i}` }));
    if (targets.length === 0) {
      return (
        <p className="text-[13px] text-muted">
          {kind === "brand" ? "調査対象テキスト" : "調査対象サイト"}が未入力のため判定していません。
        </p>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-ink" style={{ minWidth: "28rem" }}>
          <thead className="bg-panel">
            <tr className="border-b border-line text-[12px] font-bold text-muted">
              <th scope="col" className="px-2 py-2 text-left">
                {kind === "brand" ? "調査対象テキスト" : "調査対象サイト"}
              </th>
              {matrixModels.map((m) => (
                <th key={m} scope="col" className="border-l border-line px-2 py-2 text-center">
                  {providerLabel(m)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={t.entityId} className="border-b border-line last:border-0">
                <th scope="row" className="px-2 py-2 text-left font-normal text-ink">
                  {t.label}
                </th>
                {matrixModels.map((m) => (
                  <td key={m} className="border-l border-line px-2 py-2 text-center">
                    <Mark value={markOf(t.entityId, m, kind)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const citations = currentRuns.flatMap((r) =>
    r.citations.map((c) => ({ ...c, providerId: r.providerId, runId: r.id })),
  );

  return (
    <div className="space-y-6">
      <Card
        title="LLM リサーチ（単発）"
        description="1 つのプロンプトを複数モデルに同時に投げ、指定したブランド表記が回答に出るか・指定したサイトが引用されるかを確かめます。"
        actions={
          <>
            <Button onClick={() => void execute()} loading={run.state.phase === "running"} disabled={!runnable}>
              調査する
            </Button>
            {run.state.phase === "running" && (
              <Button variant="secondary" onClick={run.cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
          <Field label="プロンプト" htmlFor={`${id}-prompt`} required hint="ユーザーが AI に打つ文章をそのまま入れてください。">
            <Textarea
              id={`${id}-prompt`}
              rows={3}
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="AIO 対策に強い SEO ツールを教えて"
            />
          </Field>
          <Field label="調査名" htmlFor={`${id}-name`} hint="空欄のままなら「YYYYMMDD LLM リサーチ」になります。">
            <Input
              id={`${id}-name`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="YYYYMMDD LLM リサーチ"
            />
          </Field>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field
            label="調査対象テキスト（ブランド表記）"
            htmlFor={`${id}-text`}
            hint="改行・カンマ区切り。表記ゆれを分けて入れると判定が安定します。"
          >
            <Textarea
              id={`${id}-text`}
              rows={3}
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder={"サンプル株式会社\nSample Inc."}
            />
          </Field>
          <Field
            label="調査対象サイト（ドメイン）"
            htmlFor={`${id}-site`}
            hint="サブドメインも一致とみなします。"
          >
            <Textarea
              id={`${id}-site`}
              rows={3}
              value={targetSite}
              onChange={(e) => setTargetSite(e.target.value)}
              placeholder={"example.co.jp"}
            />
          </Field>
        </div>
        <div className="mt-2">
          <Button variant="ghost" size="sm" onClick={fillFromProject} disabled={!project}>
            自社の登録情報を入れる
          </Button>
        </div>
        <div className="mt-3">
          <ModelPicker value={models} onChange={onModelsChange} status={status} disabled={run.state.phase === "running"} />
        </div>
        {!canRun && (
          <p className="mt-2 text-[12px] text-muted">
            ANTHROPIC_API_KEY が未設定のため実行できません。過去の調査結果の閲覧と CSV 出力は引き続き使えます。
          </p>
        )}
      </Card>

      {run.state.phase === "error" && (
        <Callout tone="fail" title="調査できませんでした">
          {run.state.message}
        </Callout>
      )}

      {myResearches.length === 0 ? (
        <EmptyState
          title="まだ調査結果がありません"
          description="プロンプトと調査対象を入力して「調査する」を押すと、モデルごとの ○× と回答原文が残ります。"
        />
      ) : (
        current && (
          <>
            <Card
              title={current.name}
              description={`${current.promptText}／${new Date(current.createdAt).toLocaleString("ja-JP")}`}
              actions={
                <>
                  <Select
                    aria-label="過去の調査"
                    value={current.id}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="h-9 w-56 text-sm"
                  >
                    {myResearches.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </Select>
                  <Button variant="secondary" size="sm" onClick={exportCsv}>
                    CSV ダウンロード
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      removeResearch(current.id);
                      setSelectedId(null);
                    }}
                  >
                    削除
                  </Button>
                </>
              }
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink">調査対象テキストの言及</h3>
                  {renderMatrix("brand")}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-bold text-ink">調査対象サイトの引用</h3>
                  {renderMatrix("domain")}
                </div>
              </div>
              <p className="mt-3 text-[12px] text-muted">
                失敗したモデルは「—」で表示します（○ / × を推測しません）。
              </p>
            </Card>

            <Card title="回答原文" headingLevel={3} description="モデルごとの回答と引用元です。">
              <div className="space-y-2">
                {currentRuns.map((r) => (
                  <AnswerCard key={r.id} run={r} entities={researchEntities(current.targetTexts, current.targetSites)} />
                ))}
              </div>
            </Card>

            <Card title="引用元一覧" headingLevel={3} actions={<Badge tone="neutral">{citations.length} 件</Badge>}>
              {citations.length === 0 ? (
                <p className="text-[13px] text-muted">引用元は返されませんでした。</p>
              ) : (
                <ul className="space-y-1">
                  {citations.map((c, i) => (
                    <li key={`${c.runId}-${i}`} className="flex flex-wrap items-center gap-2 border-b border-line py-1 last:border-0">
                      <Badge tone="neutral">{providerLabel(c.providerId)}</Badge>
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 break-all text-[12px] text-accent underline-offset-2 hover:underline"
                      >
                        {c.title ?? c.url}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )
      )}
    </div>
  );
}
