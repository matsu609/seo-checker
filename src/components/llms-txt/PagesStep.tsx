"use client";

/**
 * ④ コンテンツページ。
 * サイトを巡回して候補を出し、タイトルと 1 行説明を編集・並べ替え・追加削除できる。
 */
import { useCallback } from "react";
import { Badge, Button, Callout, EmptyState, Input, Select } from "@/components/ui";
import { emptyPage, moveItem, toPage } from "@/lib/llms-txt/store";
import { SECTION_ORDER, type LlmsPage, type LlmsSection, type LlmsTxtState, type ScanResult } from "@/lib/llms-txt/types";
import { pathOf } from "@/lib/report";
import { useToolRun } from "@/lib/tools/run";
import type { StepProps } from "./WizardSteps";

export function StepPages({ state, patch }: StepProps) {
  const { state: runState, run, cancel } = useToolRun<{ scan: ScanResult; cached: boolean }>();
  const running = runState.phase === "running";

  const scan = useCallback(async () => {
    if (!state.siteUrl.trim()) return;
    const data = await run("/api/llms-txt/scan", {
      url: state.siteUrl,
      includePaths: state.includePaths,
      excludePaths: state.excludePaths,
      limit: state.limit,
    });
    if (!data) return;
    const known = new Set(state.pages.map((p) => p.url));
    const added = data.scan.candidates.filter((c) => !known.has(c.url)).map((c) => toPage(c));
    patch({
      pages: [...state.pages, ...added],
      siteName: state.siteName || data.scan.siteName,
      summary: state.summary || data.scan.siteSummary,
      sitemapUrl: state.sitemapUrl || data.scan.sitemaps[0] || "",
    });
  }, [run, patch, state]);

  const update = (id: string, next: Partial<LlmsPage>) =>
    patch({ pages: state.pages.map((p) => (p.id === id ? { ...p, ...next } : p)) });

  const move = (index: number, delta: number) =>
    patch({ pages: moveItem(state.pages, index, index + delta) });

  const enabled = state.pages.filter((p) => p.enabled).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void scan()} loading={running} disabled={!state.siteUrl.trim()}>
          サイトを巡回して候補を集める
        </Button>
        {running && (
          <Button variant="secondary" onClick={cancel}>
            中止
          </Button>
        )}
        <Button variant="secondary" onClick={() => patch({ pages: [...state.pages, emptyPage()] })}>
          手動で 1 行追加
        </Button>
        <span className="text-[13px] text-muted">
          {state.pages.length} 件中 {enabled} 件を出力します
        </span>
      </div>

      {runState.phase === "error" && (
        <Callout tone="fail" title="候補を集められませんでした">
          {runState.message}
        </Callout>
      )}

      {runState.phase === "done" && runState.data.scan.notes.length > 0 && (
        <Callout tone="info">
          <ul className="space-y-1">
            {runState.data.scan.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Callout>
      )}

      {runState.phase === "done" && runState.data.scan.existingLlmsTxt && (
        <Callout tone="info" title="このサイトには既に llms.txt があります">
          下の「既存の llms.txt を検証する」で、今の内容の過不足を確認できます。
        </Callout>
      )}

      {state.pages.length === 0 ? (
        <EmptyState
          title="候補がまだありません"
          description="「サイトを巡回して候補を集める」を押すと、sitemap と内部リンクからページを集めてタイトルと説明を埋めます。手で 1 行ずつ足すこともできます。"
        />
      ) : (
        <ul className="space-y-3">
          {state.pages.map((page, index) => (
            <li
              key={page.id}
              className={`rounded-sm border p-3 ${page.enabled ? "border-line bg-panel" : "border-line bg-surface"}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-[12px] text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-accent"
                    checked={page.enabled}
                    onChange={(e) => update(page.id, { enabled: e.target.checked })}
                  />
                  出力する
                </label>
                <Badge tone="id">{index + 1}</Badge>
                <span className="min-w-0 flex-1 break-all text-[12px] text-muted">{pathOf(page.url) || "（URL 未入力）"}</span>
                <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => move(index, -1)}>
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={index === state.pages.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => patch({ pages: state.pages.filter((p) => p.id !== page.id) })}
                >
                  削除
                </Button>
              </div>
              <div className="grid gap-2 @2xl:grid-cols-[1fr_1fr_10rem]">
                <label className="block">
                  <span className="mb-1 block text-[12px] text-muted">タイトル</span>
                  <Input
                    value={page.title}
                    placeholder="制作プラン"
                    onChange={(e) => update(page.id, { title: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] text-muted">1 行の説明</span>
                  <Input
                    value={page.description}
                    placeholder="新規サイトの立ち上げプラン。費用と納期の目安を掲載"
                    onChange={(e) => update(page.id, { description: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] text-muted">セクション</span>
                  <Select
                    value={page.section}
                    onChange={(e) => update(page.id, { section: e.target.value as LlmsSection })}
                  >
                    {SECTION_ORDER.map((section) => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block @2xl:col-span-3">
                  <span className="mb-1 block text-[12px] text-muted">URL</span>
                  <Input
                    value={page.url}
                    inputMode="url"
                    placeholder="https://example.co.jp/service/a"
                    onChange={(e) => update(page.id, { url: e.target.value })}
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export type { LlmsTxtState };
