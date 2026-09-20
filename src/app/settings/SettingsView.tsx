"use client";

/**
 * 設定画面。
 *
 * 利用者の指示（2026-09-16）: ホームページの URL はここで 1 回だけ登録し、
 * ほかのタブでは URL の入力を求めない。競合の URL だけは入力欄を残す。
 * そのため、いちばん上に「ホームページ」カードを置き、競合は別カードに分ける。
 *
 * 利用者の指示（2026-09-19）: SEO・MEO・AIO の共通の基本設定はぜんぶここに集約する。
 * 会社・店舗の基本情報（登録時のデータ）・対策キーワード・Google マップの店舗のカードを足した
 * （SharedCards.tsx）。各ツールは細かい変更だけを持つ。
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireFeature } from "@/lib/features/registry";
import { displayUrl, toSiteUrl } from "@/lib/site/target";
import { exportAll, importAll, newId, resetAll, splitList, type Competitor, type Project } from "@/lib/store";
import { useCurrentProject, useProjects } from "@/lib/store/hooks";
import { useLeadProfile } from "@/lib/account/lead-client";
import { NotificationsCard } from "@/components/settings/NotificationsCard";
import { BusinessCard, KeywordsCard, StoresCard } from "./SharedCards";

const feature = requireFeature("settings");

/** ホームページ登録カードの id。各ツールからここへ直接飛ばす（/settings#home-url） */
const HOME_URL_ANCHOR = "home-url";
/** 競合カードの id（AI 検索モニタリングから /settings#competitors で飛ぶ） */
const COMPETITORS_ANCHOR = "competitors";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/**
 * googleSection は Google 連携のカード。サーバーコンポーネントなので、
 * ここでは受け取って置くだけにする（Clerk 未設定のときは null が来る）。
 */
export function SettingsView({ googleSection }: { googleSection?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageHeader feature={feature} />
      <div className="space-y-6">
        <BusinessCard />
        <HomeUrlCard />
        <CompetitorsCard />
        <KeywordsCard />
        <StoresCard />
        {googleSection}
        <NotificationsCard />
        <DataCard />
      </div>
    </div>
  );
}

/* ───────────────────── ホームページ（自社サイト） ───────────────────── */

interface SiteDraft {
  url: string;
  name: string;
  brandAliases: string;
}

const EMPTY_SITE: SiteDraft = { url: "", name: "", brandAliases: "" };

function toSiteDraft(p: Project): SiteDraft {
  return {
    url: p.startUrl || (p.domain ? `https://${p.domain}/` : ""),
    name: p.name,
    brandAliases: p.brandAliases.join("\n"),
  };
}

/**
 * ホームページの URL を登録するカード。
 * ここに入れた URL が、サイト診断・精密診断・llms.txt・プロンプト拡張などの対象になる。
 */
function HomeUrlCard() {
  const { add, update, remove } = useProjects();
  const { project, projects, setCurrentProjectId } = useCurrentProject();
  // サイト名を空欄にしたら、登録時の会社名（屋号）を名前にする（無ければドメイン）
  const { lead } = useLeadProfile();
  const [draft, setDraft] = useState<SiteDraft>(EMPTY_SITE);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // 保存済みの値を入力欄に流し込む。localStorage はマウント後に読まれるので
  // 初回と、サイトを切り替えたときだけ同期する（入力中の値は上書きしない）。
  const syncedId = useRef<string | null>(null);
  useEffect(() => {
    if (adding) return;
    const id = project?.id ?? null;
    if (syncedId.current === id) return;
    syncedId.current = id;
    setDraft(project ? toSiteDraft(project) : EMPTY_SITE);
  }, [project, adding]);

  function startAdding() {
    setAdding(true);
    setDraft(EMPTY_SITE);
    setError(null);
    setSaved(null);
  }

  function cancelAdding() {
    setAdding(false);
    syncedId.current = null;
    setError(null);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const siteUrl = toSiteUrl(draft.url);
    if (!siteUrl) {
      setError("ホームページの URL を入力してください（例: example.co.jp）");
      setSaved(null);
      return;
    }
    const domain = new URL(siteUrl).host;
    const name = draft.name.trim() || lead?.company.trim() || domain;
    const brandAliases = splitList(draft.brandAliases);

    if (adding || !project) {
      const created = add({ name, domain, startUrl: siteUrl, brandAliases });
      setCurrentProjectId(created.id);
      syncedId.current = created.id;
      setAdding(false);
    } else {
      update(project.id, { name, domain, startUrl: siteUrl, brandAliases });
    }
    setDraft({ url: siteUrl, name, brandAliases: brandAliases.join("\n") });
    setError(null);
    setSaved(`${displayUrl(siteUrl)} を登録しました。ほかのタブではこのサイトが対象になります。`);
  }

  function onRemove() {
    if (!project) return;
    if (!window.confirm(`「${project.name}」の登録を削除します。よろしいですか？`)) return;
    remove(project.id);
    syncedId.current = null;
    setSaved(null);
    setError(null);
  }

  const registered = Boolean(project) && !adding;

  return (
    <Card
      id={HOME_URL_ANCHOR}
      title="ホームページ"
      description="ここに登録した URL が、サイト診断・精密診断・llms.txt・プロンプト拡張などすべてのタブの対象になります。各タブで URL を入力する必要はありません。データはこのブラウザ（localStorage）に保存され、サーバーには送られません。"
      actions={
        registered && (
          <Badge tone="pass" icon={false}>
            登録済み
          </Badge>
        )
      }
    >
      {projects.length > 1 && !adding && (
        <div className="mb-4 max-w-md">
          <Field label="いま対象にしているサイト" htmlFor="current-site" hint="複数登録している場合はここで切り替えます">
            <Select
              id="current-site"
              value={project?.id ?? ""}
              onChange={(e) => {
                setCurrentProjectId(e.target.value || null);
                setSaved(null);
                setError(null);
              }}
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

      <form onSubmit={onSubmit} className="grid gap-4 @2xl:grid-cols-2">
        <Field
          label="ホームページの URL"
          htmlFor="home-url-input"
          required
          error={error}
          hint="例: example.co.jp／https://example.co.jp/。下層ページを入れてもトップページとして登録します"
          className="@2xl:col-span-2"
        >
          <Input
            id="home-url-input"
            value={draft.url}
            inputMode="url"
            autoComplete="url"
            placeholder="https://example.co.jp/"
            invalid={Boolean(error)}
            onChange={(e) => {
              setDraft({ ...draft, url: e.target.value });
              setSaved(null);
            }}
          />
        </Field>
        <Field label="サイト名（任意）" htmlFor="home-url-name" hint={lead?.company ? `空欄なら会社名「${lead.company}」を名前にします` : "空欄ならドメインを名前にします"}>
          <Input
            id="home-url-name"
            value={draft.name}
            placeholder={lead?.company || "例: 自社サイト"}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field
          label="ブランドの表記（任意）"
          htmlFor="home-url-alias"
          hint="改行またはカンマ区切り。LLM の回答に社名が出たかの判定に使います"
        >
          <Textarea
            id="home-url-alias"
            value={draft.brandAliases}
            placeholder={"株式会社サンプル\nサンプル社\nSample Inc."}
            onChange={(e) => setDraft({ ...draft, brandAliases: e.target.value })}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2 @2xl:col-span-2">
          <Button type="submit">{adding || !project ? "登録する" : "保存する"}</Button>
          {adding ? (
            <Button variant="secondary" onClick={cancelAdding}>
              キャンセル
            </Button>
          ) : (
            project && (
              <>
                <Button variant="secondary" onClick={startAdding}>
                  別のサイトを追加
                </Button>
                <Button variant="danger" onClick={onRemove} className="ml-auto">
                  この登録を削除
                </Button>
              </>
            )
          )}
        </div>
      </form>

      {saved && (
        <Callout tone="pass" className="mt-4">
          {saved}
        </Callout>
      )}
    </Card>
  );
}

/* ───────────────────────── 競合 ───────────────────────── */

interface CompetitorDraft {
  id: string;
  name: string;
  domains: string;
  brandAliases: string;
}

function toCompetitorDrafts(p: Project): CompetitorDraft[] {
  return p.competitors.map((c) => ({
    id: c.id,
    name: c.name,
    domains: c.domains.join(", "),
    brandAliases: c.brandAliases.join(", "),
  }));
}

function fromCompetitorDrafts(rows: CompetitorDraft[]): Competitor[] {
  return rows
    .map((c) => ({
      id: c.id,
      name: c.name.trim(),
      domains: splitList(c.domains).map((d) => toSiteUrl(d)).filter(Boolean).map((u) => new URL(u).host),
      brandAliases: splitList(c.brandAliases),
    }))
    .filter((c) => c.name || c.domains.length > 0);
}

/**
 * 競合の登録。**URL の入力欄を残すのはここだけ**（利用者の指示 2026-09-16）。
 * 自社のホームページは上のカードで登録する。
 */
function CompetitorsCard() {
  const { update } = useProjects();
  const { project } = useCurrentProject();
  const [rows, setRows] = useState<CompetitorDraft[]>([]);
  const [saved, setSaved] = useState(false);

  const syncedId = useRef<string | null>(null);
  useEffect(() => {
    const id = project?.id ?? null;
    if (syncedId.current === id) return;
    syncedId.current = id;
    setRows(project ? toCompetitorDrafts(project) : []);
  }, [project]);

  if (!project) {
    return (
      <Card id={COMPETITORS_ANCHOR} title="競合サイト" description="順位の比較や AI 検索モニタリングの言及判定に使う競合を登録します。">
        <EmptyState
          title="先にホームページを登録してください"
          description="競合は、対象にしているホームページごとに保存します。"
        />
      </Card>
    );
  }

  function setRow(id: string, patch: Partial<CompetitorDraft>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  function onSave() {
    update(project!.id, { competitors: fromCompetitorDrafts(rows) });
    setRows(fromCompetitorDrafts(rows).map((c) => ({
      id: c.id,
      name: c.name,
      domains: c.domains.join(", "),
      brandAliases: c.brandAliases.join(", "),
    })));
    setSaved(true);
  }

  return (
    <Card
      id={COMPETITORS_ANCHOR}
      title="競合サイト"
      description={`「${project.name}」と比べる競合。順位計測の並び、精密診断の競合欄の初期値、AI 検索モニタリングの競合ブランド（名前・ドメイン・表記ゆれ）に使います。`}
      actions={
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setRows((prev) => [...prev, { id: newId(), name: "", domains: "", brandAliases: "" }]);
            setSaved(false);
          }}
        >
          競合を追加
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="競合はまだ登録されていません" description="あとからでも追加できます。" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-[13px]">
            <thead>
              <tr className="text-[12px] font-bold text-muted">
                <th className="px-1 py-1 text-left">名前</th>
                <th className="px-1 py-1 text-left">URL・ドメイン（カンマ区切り）</th>
                <th className="px-1 py-1 text-left">ブランドの表記（カンマ区切り）</th>
                <th className="px-1 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-1 py-1">
                    <Input aria-label="競合の名前" className="h-9 text-sm" value={c.name} onChange={(e) => setRow(c.id, { name: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <Input
                      aria-label="競合の URL"
                      className="h-9 text-sm"
                      value={c.domains}
                      inputMode="url"
                      placeholder="rival.jp, https://www.rival.jp/"
                      onChange={(e) => setRow(c.id, { domains: e.target.value })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <Input aria-label="競合のブランド表記" className="h-9 text-sm" value={c.brandAliases} onChange={(e) => setRow(c.id, { brandAliases: e.target.value })} />
                  </td>
                  <td className="px-1 py-1 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRows((prev) => prev.filter((x) => x.id !== c.id));
                        setSaved(false);
                      }}
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={onSave} disabled={rows.length === 0 && project.competitors.length === 0}>
          競合を保存する
        </Button>
        {saved && <span className="text-[12px] text-pass">保存しました。</span>}
      </div>
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
    if (!window.confirm("このブラウザに保存したホームページ・競合などのデータをすべて削除します。よろしいですか？")) return;
    resetAll();
    setMessage({ tone: "info", text: "すべてのデータを削除しました。" });
  }

  return (
    <Card
      title="データのエクスポート / インポート"
      description="ブラウザに保存しているデータ（ホームページ・競合・キーワードや計測履歴）を JSON で保存・復元します。別のブラウザや PC へ移すときに使います。"
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
