"use client";

/**
 * LLMO モニタリング・LLM リサーチ（B4 / B8）の画面。
 *
 * 3 つのタブ（定点モニタリング / LLM リサーチ / クエリファンアウト）を
 * 1 ページに置く。ANTHROPIC_API_KEY が無い環境でも、プロンプトの登録と
 * 保存済み履歴の閲覧はできる（実行ボタンだけを止める）。
 */
import { useMemo, useState } from "react";
import { FanoutPanel } from "./FanoutPanel";
import { MonitorPanel } from "./MonitorPanel";
import { ResearchPanel } from "./ResearchPanel";
import { Badge, Card, Field, Select, Tabs } from "@/components/ui";
import { entitiesOfProject, entitiesWithoutSignals } from "@/lib/llmo/entities";
import { PROVIDERS_META_LIST } from "@/lib/llmo/providers/meta";
import { llmoRunsStore, llmoSettingsStore } from "@/lib/llmo/store";
import type { ProviderId } from "@/lib/llmo/types";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";

type TabId = "monitor" | "research" | "fanout";

export function LlmoTool() {
  const { status } = useIntegrations();
  const { project, projects, currentProjectId, setCurrentProjectId } = useCurrentProject();
  const [settings, setSettings] = useStore(llmoSettingsStore);
  const [allRuns] = useStore(llmoRunsStore);
  const [tab, setTab] = useState<TabId>("monitor");

  const entities = useMemo(() => entitiesOfProject(project), [project]);
  const missingSignals = useMemo(() => entitiesWithoutSignals(entities), [entities]);
  const anthropicEnabled = status?.anthropic === true;
  const configuredProviders = PROVIDERS_META_LIST.filter((m) => status?.[m.integration] === true);
  const canRun = anthropicEnabled || configuredProviders.length > 0;

  const projectRuns = useMemo(
    () => allRuns.filter((r) => r.projectId === (project?.id ?? "")),
    [allRuns, project],
  );

  function setModels(models: ProviderId[]) {
    setSettings({ ...settings, models });
  }

  return (
    <div className="space-y-6">
      <Card
        title="対象プロジェクトと連携状況"
        description="回答内のブランド言及・引用ドメインは、設定画面で登録した自社・競合の情報で判定します。"
      >
        {/* 連携状況のバッジは 4 つ並ぶと Card の actions（shrink-0）では折り返せず
            横スクロールが出るため、本文の先頭に置いて折り返させる */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {PROVIDERS_META_LIST.map((m) => (
            <Badge key={m.id} tone={status?.[m.integration] ? "pass" : "neutral"} icon={false} title={m.envVar}>
              {m.label}
              {status?.[m.integration] ? " 設定済み" : " 未設定"}
            </Badge>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-[18rem_1fr]">
          <Field label="プロジェクト" htmlFor="llmo-project">
            <Select
              id="llmo-project"
              value={currentProjectId ?? project?.id ?? ""}
              onChange={(e) => setCurrentProjectId(e.target.value || null)}
              disabled={projects.length === 0}
            >
              {projects.length === 0 && <option value="">（未登録）</option>}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="text-[13px] leading-relaxed text-muted">
            {entities.length === 0 ? (
              <p>設定画面でプロジェクト（自社ドメインとブランド表記）を登録すると判定できるようになります。</p>
            ) : (
              <>
                <p>
                  判定対象: {entities.map((e) => e.name).join(" / ")}（自社 1 社 + 競合 {entities.length - 1} 社）
                </p>
                {missingSignals.length > 0 && (
                  <p className="mt-1 text-warn">
                    {missingSignals.map((e) => e.name).join(" / ")} はドメインもブランド表記も未登録のため、常に「なし」と判定されます。
                  </p>
                )}
                {!anthropicEnabled && (
                  <p className="mt-1">
                    ANTHROPIC_API_KEY が未設定のため実行はできません。プロンプトの登録・保存済み履歴の閲覧・CSV 出力は使えます。
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </Card>

      <Tabs
        ariaLabel="LLMO のモード"
        tabs={[
          { id: "monitor", label: "定点モニタリング" },
          { id: "research", label: "LLM リサーチ" },
          { id: "fanout", label: "クエリファンアウト" },
        ]}
        value={tab}
        onChange={(v) => setTab(v as TabId)}
      />

      {tab === "monitor" && (
        <MonitorPanel
          project={project}
          entities={entities}
          models={settings.models}
          onModelsChange={setModels}
          status={status}
          canRun={canRun}
        />
      )}
      {tab === "research" && (
        <ResearchPanel
          project={project}
          models={settings.models}
          onModelsChange={setModels}
          status={status}
          canRun={canRun}
        />
      )}
      {tab === "fanout" && <FanoutPanel runs={projectRuns} />}
    </div>
  );
}
