"use client";

import { useRef, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { INTEGRATIONS, INTEGRATION_KEYS } from "@/lib/features/integrations";
import { requireFeature } from "@/lib/features/registry";
import { exportAll, importAll, newId, resetAll, splitList, type Competitor, type Project } from "@/lib/store";
import { useCurrentProject, useProjects } from "@/lib/store/hooks";
import { useIntegrations } from "@/lib/store/useIntegrations";

const feature = requireFeature("settings");

interface CompetitorDraft {
  id: string;
  name: string;
  domains: string;
  brandAliases: string;
}

interface ProjectDraft {
  name: string;
  domain: string;
  startUrl: string;
  brandAliases: string;
  competitors: CompetitorDraft[];
}

const EMPTY_DRAFT: ProjectDraft = { name: "", domain: "", startUrl: "", brandAliases: "", competitors: [] };

function toDraft(p: Project): ProjectDraft {
  return {
    name: p.name,
    domain: p.domain,
    startUrl: p.startUrl,
    brandAliases: p.brandAliases.join("\n"),
    competitors: p.competitors.map((c) => ({
      id: c.id,
      name: c.name,
      domains: c.domains.join(", "),
      brandAliases: c.brandAliases.join(", "),
    })),
  };
}

function draftCompetitors(draft: ProjectDraft): Competitor[] {
  return draft.competitors
    .map((c) => ({
      id: c.id,
      name: c.name.trim(),
      domains: splitList(c.domains),
      brandAliases: splitList(c.brandAliases),
    }))
    .filter((c) => c.name || c.domains.length > 0);
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export function SettingsView() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader feature={feature} />
      <div className="space-y-6">
        <ProjectsCard />
        <IntegrationsCard />
        <DataCard />
      </div>
    </div>
  );
}

/* ───────────────────────── プロジェクト ───────────────────────── */

function ProjectsCard() {
  const { projects, add, update, remove } = useProjects();
  const { project: current, currentProjectId, setCurrentProjectId } = useCurrentProject();
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditing("new");
    setError(null);
  }

  function startEdit(p: Project) {
    setDraft(toDraft(p));
    setEditing(p.id);
    setError(null);
  }

  function cancel() {
    setEditing(null);
    setError(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.domain.trim()) {
      setError("ドメインを入力してください");
      return;
    }
    const competitors = draftCompetitors(draft);
    if (editing === "new") {
      add({
        name: draft.name,
        domain: draft.domain,
        startUrl: draft.startUrl,
        brandAliases: splitList(draft.brandAliases),
        competitors,
      });
    } else if (editing) {
      update(editing, {
        name: draft.name.trim() || draft.domain.trim(),
        domain: draft.domain,
        startUrl: draft.startUrl.trim(),
        brandAliases: splitList(draft.brandAliases),
        competitors,
      });
    }
    setEditing(null);
  }

  function onRemove(p: Project) {
    if (!window.confirm(`プロジェクト「${p.name}」を削除します。よろしいですか？`)) return;
    remove(p.id);
    if (editing === p.id) setEditing(null);
  }

  function setCompetitor(id: string, patch: Partial<CompetitorDraft>) {
    setDraft((d) => ({ ...d, competitors: d.competitors.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  }

  return (
    <Card
      title="プロジェクト"
      description="診断・計測の対象にする自社ドメインと競合。データはこのブラウザ（localStorage）に保存され、サーバーには送られません。"
      actions={
        editing === null && (
          <Button size="sm" onClick={startNew}>
            プロジェクトを追加
          </Button>
        )
      }
    >
      {projects.length > 0 && (
        <div className="mb-4 max-w-md">
          <Field label="現在のプロジェクト" htmlFor="current-project" hint="各ツールはこのプロジェクトを対象にします">
            <Select
              id="current-project"
              value={current?.id ?? ""}
              onChange={(e) => setCurrentProjectId(e.target.value || null)}
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.domain}）
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {projects.length === 0 && editing === null ? (
        <EmptyState
          title="プロジェクトがまだありません"
          description="自社ドメインを登録すると、順位計測や LLMO モニタリングでそのドメイン・ブランド名を自動で使います。"
          action={<Button onClick={startNew}>最初のプロジェクトを追加</Button>}
        />
      ) : (
        projects.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] text-ink">
              <thead>
                <tr className="border-b border-line text-[12px] font-bold text-muted">
                  <th className="px-2 py-2 text-left">名前</th>
                  <th className="px-2 py-2 text-left">ドメイン</th>
                  <th className="px-2 py-2 text-left">開始 URL</th>
                  <th className="px-2 py-2 text-right">競合</th>
                  <th className="px-2 py-2 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="px-2 py-2">
                      <span className="font-bold">{p.name}</span>
                      {p.id === (currentProjectId ?? current?.id) && (
                        <Badge tone="free" className="ml-2">
                          現在
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 break-all">{p.domain}</td>
                    <td className="px-2 py-2 break-all text-muted">{p.startUrl}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{p.competitors.length}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">
                      <Button size="sm" variant="secondary" onClick={() => startEdit(p)} className="mr-1">
                        編集
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => onRemove(p)}>
                        削除
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {editing !== null && (
        <form onSubmit={onSubmit} className="mt-5 rounded-sm border border-line bg-surface p-4">
          <h3 className="text-sm font-bold text-ink">{editing === "new" ? "プロジェクトを追加" : "プロジェクトを編集"}</h3>
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <Field label="名前" htmlFor="p-name" hint="空欄ならドメインを名前にします">
              <Input id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例: 自社サイト" />
            </Field>
            <Field label="ドメイン" htmlFor="p-domain" required error={error}>
              <Input
                id="p-domain"
                value={draft.domain}
                onChange={(e) => setDraft({ ...draft, domain: e.target.value })}
                placeholder="example.co.jp"
                inputMode="url"
                invalid={Boolean(error)}
              />
            </Field>
            <Field label="開始 URL" htmlFor="p-start" hint="サイト診断のクロール起点。空欄なら https://ドメイン/">
              <Input id="p-start" value={draft.startUrl} onChange={(e) => setDraft({ ...draft, startUrl: e.target.value })} placeholder="https://example.co.jp/" inputMode="url" />
            </Field>
            <Field label="ブランドの表記" htmlFor="p-alias" hint="改行またはカンマ区切り。LLM の回答に社名が出たかの判定に使います">
              <Textarea id="p-alias" value={draft.brandAliases} onChange={(e) => setDraft({ ...draft, brandAliases: e.target.value })} placeholder={"株式会社サンプル\nサンプル社\nSample Inc."} />
            </Field>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <h4 className="text-[13px] font-bold text-ink">競合</h4>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  competitors: [...d.competitors, { id: newId(), name: "", domains: "", brandAliases: "" }],
                }))
              }
            >
              競合を追加
            </Button>
          </div>
          {draft.competitors.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted">競合は後からでも追加できます。</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-[13px]">
                <thead>
                  <tr className="text-[12px] font-bold text-muted">
                    <th className="px-1 py-1 text-left">名前</th>
                    <th className="px-1 py-1 text-left">ドメイン（カンマ区切り）</th>
                    <th className="px-1 py-1 text-left">ブランドの表記（カンマ区切り）</th>
                    <th className="px-1 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {draft.competitors.map((c) => (
                    <tr key={c.id}>
                      <td className="px-1 py-1">
                        <Input aria-label="競合の名前" className="h-9 text-sm" value={c.name} onChange={(e) => setCompetitor(c.id, { name: e.target.value })} />
                      </td>
                      <td className="px-1 py-1">
                        <Input aria-label="競合のドメイン" className="h-9 text-sm" value={c.domains} onChange={(e) => setCompetitor(c.id, { domains: e.target.value })} placeholder="rival.jp, www.rival.jp" />
                      </td>
                      <td className="px-1 py-1">
                        <Input aria-label="競合のブランド表記" className="h-9 text-sm" value={c.brandAliases} onChange={(e) => setCompetitor(c.id, { brandAliases: e.target.value })} />
                      </td>
                      <td className="px-1 py-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDraft((d) => ({ ...d, competitors: d.competitors.filter((x) => x.id !== c.id) }))}
                        >
                          削除
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <Button type="submit">{editing === "new" ? "追加する" : "保存する"}</Button>
            <Button variant="secondary" onClick={cancel}>
              キャンセル
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

/* ───────────────────────── 外部連携 ───────────────────────── */

function IntegrationsCard() {
  const { status, loading, error, reload } = useIntegrations();
  return (
    <Card
      title="外部連携"
      description="API キーはサーバーの .env.local にだけ置きます。この画面には設定の有無しか表示されません。変更後は開発サーバーを再起動してください。"
      actions={
        <Button size="sm" variant="secondary" onClick={reload} loading={loading}>
          再確認
        </Button>
      }
    >
      {error && (
        <Callout tone="warn" className="mb-4">
          {error}
        </Callout>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] text-ink">
          <thead>
            <tr className="border-b border-line text-[12px] font-bold text-muted">
              <th className="px-2 py-2 text-left">連携</th>
              <th className="px-2 py-2 text-left">環境変数</th>
              <th className="px-2 py-2 text-left">状態</th>
              <th className="px-2 py-2 text-left">用途</th>
            </tr>
          </thead>
          <tbody>
            {INTEGRATION_KEYS.map((key) => {
              const meta = INTEGRATIONS[key];
              const on = status?.[key] ?? false;
              return (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="px-2 py-2 font-bold whitespace-nowrap">{meta.label}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1">
                      {meta.envVars.map((v) => (
                        <code key={v} className="rounded-sm border border-line bg-surface px-1 font-mono text-[11px]">
                          {v}
                        </code>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">
                    {status === null ? (
                      <span className="text-[12px] text-muted">確認中…</span>
                    ) : on ? (
                      <Badge tone="pass">設定済み</Badge>
                    ) : (
                      <Badge tone="neutral" icon={false}>
                        未設定
                      </Badge>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted">{meta.description}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-muted">
        変数の一覧と書き方は <code className="font-mono">.env.example</code> を参照してください。
      </p>
    </Card>
  );
}

/* ───────────────────────── データ ───────────────────────── */

function DataCard() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: "pass" | "fail" | "info"; text: string } | null>(null);

  function onExport() {
    const env = exportAll();
    const blob = new Blob([JSON.stringify(env, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seo-checker-data_${stamp()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ tone: "info", text: "JSON をダウンロードしました。" });
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const result = importAll(text);
      const skipped = result.skipped.length > 0 ? `（読み飛ばし: ${result.skipped.join(", ")}）` : "";
      setMessage({
        tone: result.imported.length > 0 ? "pass" : "fail",
        text:
          result.imported.length > 0
            ? `${result.imported.length} 件のデータを読み込みました${skipped}`
            : `読み込めるデータがありませんでした${skipped}`,
      });
    } catch (err) {
      setMessage({ tone: "fail", text: (err as Error).message });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onReset() {
    if (!window.confirm("このブラウザに保存したプロジェクト・競合などのデータをすべて削除します。よろしいですか？")) return;
    resetAll();
    setMessage({ tone: "info", text: "すべてのデータを削除しました。" });
  }

  return (
    <Card
      title="データのエクスポート / インポート"
      description="ブラウザに保存しているデータ（プロジェクト・競合・今後追加されるキーワードや計測履歴）を JSON で保存・復元します。別のブラウザや PC へ移すときに使います。"
    >
      <div className="flex flex-wrap gap-2">
        <Button onClick={onExport}>JSON をダウンロード</Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          JSON を読み込む
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="エクスポートした JSON ファイル"
          onChange={(e) => onImportFile(e.target.files?.[0])}
        />
        <Button variant="danger" onClick={onReset} className="ml-auto">
          すべてのデータを削除
        </Button>
      </div>
      {message && (
        <Callout tone={message.tone} className="mt-4">
          {message.text}
        </Callout>
      )}
      <p className="mt-3 text-[12px] text-muted">読み込むと同じ名前のデータは上書きされます。形式が合わない項目は読み飛ばします。</p>
    </Card>
  );
}
