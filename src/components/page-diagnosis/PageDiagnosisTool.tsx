"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Callout, Card, EmptyState, Field, Input, Select, Tabs } from "@/components/ui";
import { DEVICE_LABELS, rankKeywordsStore } from "@/lib/rank/store";
import {
  findDiagnosis,
  pageDiagnosesStore,
  pageDiagnosisSettingsStore,
  saveDiagnosis,
  removeDiagnosis,
} from "@/lib/page-diagnosis/store";
import type { DiagnosisResult } from "@/lib/page-diagnosis/types";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";
import { ContentTab } from "./ContentTab";
import { IssuesTab } from "./IssuesTab";
import { SerpTab } from "./SerpTab";

type TabId = "serp" | "issues" | "content";

interface DiagnosisResponse {
  result: DiagnosisResult;
  cached?: boolean;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { dateStyle: "short", timeStyle: "short" });
}

/** ページ診断（A4）の画面 */
export function PageDiagnosisTool() {
  const id = useId();
  const { status } = useIntegrations();
  const serpEnabled = status?.serpapi === true;
  const anthropicEnabled = status?.anthropic === true;
  // requiresAny: どちらか 1 つあれば実行できる（両方無いときは実行不可）
  const canRun = serpEnabled || anthropicEnabled;

  const { project } = useCurrentProject();
  const [settings, setSettings] = useStore(pageDiagnosisSettingsStore);
  const [diagnoses] = useStore(pageDiagnosesStore);
  const [rankKeywords] = useStore(rankKeywordsStore);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("serp");
  const { state, run, cancel } = useToolRun<DiagnosisResponse>();

  // 選択中の診断が消えた（削除された）ときは先頭に戻す。
  // 副作用で selectedId を消さずに派生値側で吸収する
  const selected = useMemo(() => {
    const found = selectedId ? findDiagnosis(diagnoses, selectedId) : null;
    return found ?? diagnoses[0] ?? null;
  }, [diagnoses, selectedId]);

  const keywordSuggestions = useMemo(() => {
    const set = new Set<string>(rankKeywords.map((k) => k.keyword).filter(Boolean));
    return Array.from(set).slice(0, 50);
  }, [rankKeywords]);

  const keyword = settings.keyword.trim();
  const running = state.phase === "running";

  async function execute() {
    if (!keyword || !canRun) return;
    const data = await run("/api/page-diagnosis", {
      keyword,
      ...(settings.url.trim() ? { url: settings.url.trim() } : {}),
      device: settings.device,
      ...(settings.location.trim() ? { location: settings.location.trim() } : {}),
      ...(project?.domain ? { projectDomain: project.domain } : {}),
    });
    if (!data) return;
    saveDiagnosis(data.result);
    setSelectedId(data.result.id);
    setTab("serp");
  }

  const tabs = [
    { id: "serp" as const, label: "SERP 分析" },
    { id: "issues" as const, label: "課題分析" },
    { id: "content" as const, label: "コンテンツ分析" },
  ];

  return (
    <div className="space-y-6">
      {!canRun && (
        <Callout tone="info" title="外部連携が未設定のため診断は実行できません">
          SERPAPI_KEY があれば検索順位を実測し、ANTHROPIC_API_KEY があれば Claude の Web 検索で上位ページを推定します。
          どちらか 1 つを
          <Link href="/settings" className="mx-1 font-bold text-accent underline-offset-2 hover:underline">
            設定
          </Link>
          すると実行できます。
        </Callout>
      )}

      <Card
        title="診断する"
        description="対策キーワードは必須です。対象 URL を省略すると、検索結果の中で自社ドメインの最上位ページを対象にします。"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="対策キーワード" htmlFor={`${id}-keyword`} required hint="例: AIO 対策 とは">
            <Input
              id={`${id}-keyword`}
              list={`${id}-keyword-list`}
              value={settings.keyword}
              placeholder="対策キーワード"
              onChange={(e) => setSettings({ ...settings, keyword: e.target.value })}
              disabled={running}
            />
            <datalist id={`${id}-keyword-list`}>
              {keywordSuggestions.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>

          <Field
            label="対象 URL（任意）"
            htmlFor={`${id}-url`}
            hint={
              project?.domain
                ? `省略すると ${project.domain} の最上位ページを自動で選びます`
                : "省略する場合は、設定画面でプロジェクト（自社ドメイン）を登録してください"
            }
          >
            <Input
              id={`${id}-url`}
              value={settings.url}
              placeholder="https://example.com/page"
              onChange={(e) => setSettings({ ...settings, url: e.target.value })}
              disabled={running}
            />
          </Field>

          <Field label="デバイス" htmlFor={`${id}-device`}>
            <Select
              id={`${id}-device`}
              value={settings.device}
              onChange={(e) => setSettings({ ...settings, device: e.target.value as "desktop" | "mobile" })}
              disabled={running}
            >
              {(["desktop", "mobile"] as const).map((d) => (
                <option key={d} value={d}>
                  {DEVICE_LABELS[d]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="地域（任意）" htmlFor={`${id}-location`} hint="例: Tokyo, Japan（SERPAPI_KEY があるときのみ有効）">
            <Input
              id={`${id}-location`}
              value={settings.location}
              placeholder="Tokyo, Japan"
              onChange={(e) => setSettings({ ...settings, location: e.target.value })}
              disabled={running || !serpEnabled}
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button onClick={() => void execute()} loading={running} disabled={!canRun || keyword.length === 0}>
            診断する
          </Button>
          {running && (
            <Button variant="secondary" onClick={cancel}>
              中止
            </Button>
          )}
          <p className="text-[12px] text-muted">
            {serpEnabled
              ? "上位 10 件を検索 API で実測し、各ページを取得して比較します（1 分ほどかかります）。"
              : anthropicEnabled
                ? "SERPAPI_KEY が無いため、上位ページは Claude の Web 検索による推定になります。"
                : "実行するには SERPAPI_KEY か ANTHROPIC_API_KEY が必要です。"}
          </p>
        </div>

        {state.phase === "error" && (
          <Callout tone="fail" className="mt-4">
            {state.message}
          </Callout>
        )}
      </Card>

      {diagnoses.length > 0 && (
        <Card title="保存した診断" description="診断結果はこのブラウザに保存されます（最新 20 件）。">
          <ul className="divide-y divide-line">
            {diagnoses.map((d) => {
              const active = selected?.id === d.id;
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <span className={`text-[13px] ${active ? "font-bold text-accent" : "text-ink"}`}>{d.keyword}</span>
                    <span className="ml-2 break-all text-[12px] text-muted">{d.targetUrl ?? "対策ページなし"}</span>
                    <span className="ml-2 text-[11px] text-muted">{formatDateTime(d.createdAt)}</span>
                    {d.serpSource === "web_search" && (
                      <Badge tone="warn" className="ml-2">
                        推定
                      </Badge>
                    )}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => removeDiagnosis(d.id)}>
                    削除
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {selected ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
            <span className="font-bold text-ink">{selected.keyword}</span>
            <span className="break-all">{selected.targetUrl ?? "対策ページなし"}</span>
            <span>{DEVICE_LABELS[selected.device]}</span>
            <span>{formatDateTime(selected.createdAt)}</span>
            {selected.model && <span>分析モデル: {selected.model}</span>}
          </div>

          {selected.notes.length > 0 && (
            <Callout tone="info" title="この診断についての注記">
              <ul className="list-disc space-y-1 pl-5">
                {selected.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Callout>
          )}

          <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="ページ診断の表示切り替え" />
          {tab === "serp" && <SerpTab diagnosis={selected} />}
          {tab === "issues" && <IssuesTab diagnosis={selected} />}
          {tab === "content" && <ContentTab diagnosis={selected} chatEnabled={anthropicEnabled} />}
        </div>
      ) : (
        <EmptyState
          title="まだ診断結果がありません"
          description="対策キーワード（と必要なら対象 URL）を入力して「診断する」を押すと、上位 10 件との比較と改善提案が表示されます。"
        />
      )}
    </div>
  );
}
