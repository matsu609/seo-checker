"use client";

/**
 * プロンプト拡張（B7）の画面。
 *
 * 参考プロンプト + 対象サイト URL から、AI に打たれそうなプロンプトを
 * カテゴリ別に生成する。ANTHROPIC_API_KEY が無い環境では生成ボタンだけを止め、
 * 過去の生成結果の閲覧・コピー・LLMO への登録はそのまま使える。
 */
import { useId, useMemo, useState } from "react";
import { CategoryAccordion } from "./CategoryAccordion";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  StatCard,
  Textarea,
} from "@/components/ui";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import { promptsToText } from "@/lib/llmo/expansion/postprocess";
import {
  parseSeedText,
  promptExpansionSettingsStore,
  promptExpansionsStore,
  removeExpansion,
  saveExpansion,
} from "@/lib/llmo/expansion/store";
import {
  DEFAULT_COUNT,
  MAX_SEED_PROMPTS,
  type ExpansionResult,
} from "@/lib/llmo/expansion/types";
import { addPrompts } from "@/lib/llmo/store";
import { useCurrentProject, useStore } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { useToolRun } from "@/lib/tools/run";

const COUNTS = [20, 30, 50, 80, 100];

export function PromptExpansionTool() {
  const id = useId();
  const { status } = useIntegrations();
  const { project } = useCurrentProject();
  const [settings, setSettings] = useStore(promptExpansionSettingsStore);
  const [expansions] = useStore(promptExpansionsStore);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const generate = useToolRun<ExpansionResult>();

  const anthropicEnabled = status?.anthropic === true;
  const projectId = project?.id ?? "";
  const mine = useMemo(() => expansions.filter((e) => e.projectId === projectId), [expansions, projectId]);
  const current = useMemo(() => mine.find((e) => e.id === selectedId) ?? mine[0] ?? null, [mine, selectedId]);
  const result = current?.result ?? null;

  const seedPrompts = parseSeedText(settings.seedText).slice(0, MAX_SEED_PROMPTS);
  const siteUrl = settings.siteUrl.trim();
  const canGenerate = anthropicEnabled && seedPrompts.length > 0 && siteUrl.length > 0;

  async function runGenerate() {
    setNotice(null);
    if (!canGenerate) return;
    const data = await generate.run("/api/prompt-expansion", {
      seedPrompts,
      siteUrl,
      count: settings.count,
    });
    if (!data) return;
    const stored = saveExpansion(data, projectId);
    setSelectedId(stored.id);
    setSelected(new Set());
    setNotice(`${data.total} 本のプロンプトを生成しました。`);
  }

  async function copy(label: string, texts: readonly string[], withCategory: boolean) {
    if (!result) return;
    const text = withCategory
      ? result.categories
          .filter((c) => c.prompts.some((p) => texts.includes(p.text)))
          .map((c) =>
            c.prompts
              .filter((p) => texts.includes(p.text))
              .map((p) => `${c.name}\t${p.text}`)
              .join("\n"),
          )
          .join("\n")
      : texts.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLabel(label);
      window.setTimeout(() => setCopiedLabel(null), 2000);
    } catch {
      setNotice("クリップボードにコピーできませんでした。テキストを選択してコピーしてください。");
    }
  }

  function toggle(text: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(text);
      else next.delete(text);
      return next;
    });
  }

  function toggleAll(texts: string[], checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of texts) {
        if (checked) next.add(t);
        else next.delete(t);
      }
      return next;
    });
  }

  function registerToLlmo() {
    if (!result) return;
    let added = 0;
    for (const category of result.categories) {
      const texts = category.prompts.map((p) => p.text).filter((t) => selected.has(t));
      if (texts.length === 0) continue;
      added += addPrompts(texts, { projectId, category: category.name }).length;
    }
    setNotice(
      added > 0
        ? `${added} 本を LLMO モニタリングのプロンプトとして登録しました。`
        : "登録できる新しいプロンプトがありませんでした（すでに登録済みです）。",
    );
  }

  function exportCsv() {
    if (!result) return;
    const rows = result.categories.flatMap((c) =>
      c.prompts.map((p) => ({ category: c.name, definition: c.definition, text: p.text, chars: p.chars })),
    );
    downloadCsv(
      csvFileName("prompt-expansion", new Date()),
      [
        { header: "カテゴリ", value: (r) => r.category },
        { header: "定義", value: (r) => r.definition },
        { header: "プロンプト", value: (r) => r.text },
        { header: "文字数", value: (r) => r.chars },
      ],
      rows,
    );
  }

  return (
    <div className="space-y-6">
      <Card
        title="生成条件"
        description="参考プロンプトと対象サイトから、見込み客が AI に打ちそうな関連プロンプトを作ります。対象サイトのトップページ（タイトル・ナビゲーション・見出し）を文脈として読み取ります。"
        actions={
          <>
            <Button onClick={() => void runGenerate()} loading={generate.state.phase === "running"} disabled={!canGenerate}>
              プロンプトを生成
            </Button>
            {generate.state.phase === "running" && (
              <Button variant="secondary" onClick={generate.cancel}>
                中止
              </Button>
            )}
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-[1fr_18rem_8rem]">
          <Field
            label="参考プロンプト"
            htmlFor={`${id}-seed`}
            required
            hint={`1 行 1 本。${MAX_SEED_PROMPTS} 本まで。`}
          >
            <Textarea
              id={`${id}-seed`}
              rows={4}
              value={settings.seedText}
              onChange={(e) => setSettings({ ...settings, seedText: e.target.value })}
              placeholder={"AIO 対策に強い SEO ツールを教えて\nLLMO の始め方は？"}
            />
          </Field>
          <Field label="対象サイト URL" htmlFor={`${id}-url`} required hint="業種に合ったプロンプトにするために読みます。">
            <Input
              id={`${id}-url`}
              value={settings.siteUrl}
              onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
              placeholder={project?.startUrl || "https://example.co.jp/"}
            />
          </Field>
          <Field label="生成数" htmlFor={`${id}-count`}>
            <Select
              id={`${id}-count`}
              value={settings.count}
              onChange={(e) => setSettings({ ...settings, count: Number(e.target.value) || DEFAULT_COUNT })}
            >
              {COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c} 本
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!anthropicEnabled && (
          <p className="mt-3 text-[12px] text-muted">
            ANTHROPIC_API_KEY が未設定のため生成はできません。過去の生成結果の閲覧・コピー・LLMO への登録は引き続き使えます。
          </p>
        )}
        {notice && <p className="mt-2 text-[12px] text-muted">{notice}</p>}
      </Card>

      {generate.state.phase === "error" && (
        <Callout tone="fail" title="生成できませんでした">
          {generate.state.message}
        </Callout>
      )}

      {!result ? (
        <EmptyState
          title="まだ生成結果がありません"
          description="参考プロンプトを 1 本以上と対象サイト URL を入れて「プロンプトを生成」を押してください。"
        />
      ) : (
        <>
          <Card
            title="生成結果"
            description={`元プロンプト: ${result.seedPrompts.join(" / ")}`}
            actions={
              <>
                {mine.length > 1 && (
                  <Select
                    aria-label="過去の生成結果"
                    value={current?.id ?? ""}
                    onChange={(e) => {
                      setSelectedId(e.target.value);
                      setSelected(new Set());
                    }}
                    className="h-9 w-56 text-sm"
                  >
                    {mine.map((e) => (
                      <option key={e.id} value={e.id}>
                        {new Date(e.result.generatedAt).toLocaleString("ja-JP")}／{e.result.total} 本
                      </option>
                    ))}
                  </Select>
                )}
                <Button variant="secondary" size="sm" onClick={exportCsv}>
                  CSV ダウンロード
                </Button>
                {current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      removeExpansion(current.id);
                      setSelectedId(null);
                      setSelected(new Set());
                    }}
                  >
                    削除
                  </Button>
                )}
              </>
            }
          >
            <div className="grid gap-3 sm:grid-cols-4">
              <StatCard label="作成プロンプト数" value={result.total} unit="本" hint={`目標 ${result.requested} 本`} />
              <StatCard label="カテゴリ数" value={result.categories.length} unit="カテゴリ" />
              <StatCard
                label="作成日"
                value={new Date(result.generatedAt).toLocaleDateString("ja-JP")}
                hint={result.model}
              />
              <StatCard label="選択中" value={selected.size} unit="本" hint="LLMO へ登録する対象" />
            </div>
            <div className="mt-4 rounded-sm border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
              <p>
                調査対象: <span className="break-all text-ink">{result.siteUrl}</span>
              </p>
              {result.site ? (
                <p className="mt-1">
                  読み取った文脈: {result.site.title ?? "（タイトルなし）"}
                  {result.site.navLabels.length > 0 && `／ナビ: ${result.site.navLabels.slice(0, 8).join("・")}`}
                </p>
              ) : (
                <p className="mt-1 text-warn">
                  対象サイトを読めなかったため、参考プロンプトだけを手掛かりに生成しています（{result.siteError ?? "理由不明"}）。
                </p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copy("all:plain", result.categories.flatMap((c) => c.prompts.map((p) => p.text)), false)}
              >
                {copiedLabel === "all:plain" ? "コピーしました" : "プロンプトのみコピー（全件）"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(promptsToText(result.categories, true));
                    setCopiedLabel("all:labeled");
                    window.setTimeout(() => setCopiedLabel(null), 2000);
                  } catch {
                    setNotice("クリップボードにコピーできませんでした。");
                  }
                }}
              >
                {copiedLabel === "all:labeled" ? "コピーしました" : "カテゴリ名を入れてコピー（全件）"}
              </Button>
              <Button size="sm" onClick={registerToLlmo} disabled={selected.size === 0}>
                LLMO モニタリングに登録（{selected.size}）
              </Button>
              {!project && <Badge tone="neutral">プロジェクト未選択のまま登録できます</Badge>}
            </div>
          </Card>

          <div className="space-y-2">
            {result.categories.map((category, i) => (
              <CategoryAccordion
                key={category.name}
                category={category}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onCopy={(texts, withCategory) =>
                  void copy(`${category.name}:${withCategory ? "labeled" : "plain"}`, texts, withCategory)
                }
                copiedLabel={copiedLabel}
                defaultOpen={i === 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
