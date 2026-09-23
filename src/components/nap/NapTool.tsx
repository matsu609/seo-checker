"use client";

/**
 * NAP チェック（表記ゆれの検出）の画面。
 *
 * 1. 「正」の 4 項目（店名・住所・電話番号・サイト URL）。設定の基本情報と MEO の登録店舗から取り込める
 * 2. 「チェックする」→ /api/nap/check が自社サイト・Google マップ・掲載ページ・ウェブ検索のページを開いて突き合わせる
 * 3. 直すべき箇所（不一致 → 要確認の順）→ 媒体ごとの一致表 → サイトに貼る構造化データ → 確認していないこと → 履歴
 *
 * 一致か不一致かをそのまま出す。「記載なし」は「載っていない」ではなく「自動では読めなかった」も含むので、文言で必ず添える。
 */
import { useMemo, useState } from "react";
import { Badge, Button, Callout, Card, CopyButton, DataTable, EmptyState, StatCard, type BadgeTone, type Column } from "@/components/ui";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import { napHistoryStore, pushNapHistory, removeNapHistory, type NapHistoryItem } from "@/lib/nap/store";
import {
  FIELD_STATUS_LABELS,
  NAP_FIELD_LABELS,
  NAP_FIELDS,
  NAP_SOURCE_KIND_LABELS,
  type FieldCheck,
  type FieldStatus,
  type NapCheckResult,
  type NapField,
  type NapIssue,
  type NapSource,
} from "@/lib/nap/types";
import { BasicInfoNotice, missingFields } from "@/components/site/BasicInfoNotice";
import { StorePicker, useStoreProfileForm } from "@/components/site/useStoreProfileForm";
import { useStore } from "@/lib/store/hooks";
import { useToolRun } from "@/lib/tools/run";

const STATUS_TONE: Record<FieldStatus, BadgeTone> = { match: "pass", mismatch: "fail", missing: "warn", skipped: "neutral" };
const SEVERITY_LABEL: Record<NapIssue["severity"], string> = { fail: "不一致", warn: "要確認" };
const SEVERITY_TONE: Record<NapIssue["severity"], BadgeTone> = { fail: "fail", warn: "warn" };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function fieldOf(source: NapSource, field: NapField): FieldCheck | null {
  return source.fields.find((f) => f.field === field) ?? null;
}

function cellTitle(f: FieldCheck | null): string | undefined {
  if (!f) return undefined;
  const parts = [f.found ? `書かれている値: ${f.found}` : null, f.note ?? null].filter(Boolean);
  return parts.length > 0 ? parts.join("。") : undefined;
}

const ISSUE_CSV = [
  { header: "重さ", value: (i: NapIssue) => SEVERITY_LABEL[i.severity] },
  { header: "媒体の種類", value: (i: NapIssue) => NAP_SOURCE_KIND_LABELS[i.sourceKind] },
  { header: "媒体", value: (i: NapIssue) => i.source },
  { header: "項目", value: (i: NapIssue) => (i.field ? NAP_FIELD_LABELS[i.field] : "") },
  { header: "内容", value: (i: NapIssue) => i.title },
  { header: "書かれている値 → 正", value: (i: NapIssue) => i.detail },
  { header: "直し方", value: (i: NapIssue) => i.action },
  { header: "URL", value: (i: NapIssue) => i.url ?? "" },
];

function SourceCell({ source }: { source: NapSource }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {source.url ? (
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline" title={source.url}>
            {source.label}
          </a>
        ) : (
          <span className="text-ink">{source.label}</span>
        )}
      </div>
      <div className="text-[11px] text-muted">{NAP_SOURCE_KIND_LABELS[source.kind]}</div>
      {source.error && <div className="mt-0.5 text-[11px] text-fail">{source.error}</div>}
    </div>
  );
}

const SOURCE_COLUMNS: readonly Column<NapSource>[] = [
  { key: "source", header: "媒体", render: (row) => <SourceCell source={row} />, accessor: (row) => row.label, sortable: true, nowrap: false },
  ...NAP_FIELDS.map(
    (field): Column<NapSource> => ({
      key: field,
      header: NAP_FIELD_LABELS[field],
      accessor: (row) => {
        const f = fieldOf(row, field);
        return f ? { match: 3, mismatch: 0, missing: 1, skipped: 2 }[f.status] : 2;
      },
      sortable: true,
      render: (row) => {
        const f = fieldOf(row, field);
        if (row.error || !f) return <span className="text-muted">—</span>;
        return (
          <div className="min-w-0" title={cellTitle(f)}>
            <Badge tone={STATUS_TONE[f.status]} icon={false}>
              {FIELD_STATUS_LABELS[f.status]}
            </Badge>
            {f.status === "mismatch" && f.found && <div className="mt-0.5 line-clamp-2 break-all text-[11px] text-muted">{f.found}</div>}
            {f.status === "match" && f.note && <div className="mt-0.5 text-[11px] text-warn">{f.note}</div>}
          </div>
        );
      },
    }),
  ),
];

function Result({ data }: { data: NapCheckResult }) {
  const fails = data.issues.filter((i) => i.severity === "fail");
  return (
    <>
      <Card
        title="外部サイトの掲載状況"
        description="正の値と、各媒体に書かれている値を項目ごとに比べた結果です。セルにマウスを乗せると書かれている値が出ます。自社サイトのページの「サイト URL」は自分のページなので比べません（—）。"
      >
        {data.sources.length === 0 ? (
          <EmptyState title="確認できた媒体がありません" description="サイト URL を入れるか、MEO で店舗を登録するか、「掲載」タブで掲載ページの URL を控えると、ここに並びます。" />
        ) : (
          <DataTable columns={SOURCE_COLUMNS} rows={data.sources} rowKey={(r, i) => `${r.kind}-${r.url ?? r.label}-${i}`} stickyHeader />
        )}
      </Card>

      <Card
        title={`直すべき箇所（${data.issues.length} 件）`}
        description="不一致（正と違う値が書かれている）を上に、要確認（書かれていない・読めなかった・建物名だけ違う）を下に並べています。上から順に直してください。"
        actions={
          data.issues.length > 0 ? (
            <Button size="sm" variant="ghost" onClick={() => downloadCsv(csvFileName(`nap-${data.input.name}`, new Date(data.checkedAt)), ISSUE_CSV, data.issues)}>
              CSV
            </Button>
          ) : undefined
        }
      >
        {data.issues.length === 0 ? (
          <EmptyState title="直すべき箇所はありません" description="確認できた媒体の店名・住所・電話番号・サイト URL は、すべて正と一致しています。" />
        ) : (
          <ol className="divide-y divide-line border-y border-line">
            {data.issues.map((issue, i) => (
              <li key={`${issue.sourceKind}-${issue.source}-${issue.field ?? "x"}-${i}`} className="flex flex-col gap-1 py-3 text-[13px] @2xl:flex-row @2xl:gap-4">
                <div className="flex shrink-0 items-start gap-2 @2xl:w-56">
                  <span className="w-6 shrink-0 text-right font-mono text-[12px] text-muted">{i + 1}</span>
                  <Badge tone={SEVERITY_TONE[issue.severity]} icon={false}>
                    {SEVERITY_LABEL[issue.severity]}
                  </Badge>
                  {issue.field && (
                    <Badge tone="neutral" icon={false}>
                      {NAP_FIELD_LABELS[issue.field]}
                    </Badge>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-bold text-ink">{issue.title}</div>
                  <div className="break-all text-[12px] text-muted">{issue.detail}</div>
                  <div className="text-[12px] text-ink">
                    <span className="mr-1 font-bold">直し方:</span>
                    {issue.action}
                  </div>
                  {issue.url && (
                    <a href={issue.url} target="_blank" rel="noopener noreferrer" className="inline-block break-all text-[12px] text-accent underline-offset-2 hover:underline">
                      {issue.url}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="サマリー" description={`確認日時: ${formatDate(data.checkedAt)}。正: ${data.input.name} / ${data.input.address || "住所なし"} / ${data.input.phone || "電話なし"} / ${data.input.website || "サイトなし"}`}>
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
          <StatCard label="確認できた媒体" value={data.summary.sources} unit="件" hint="ページを開いて値を読めたもの（自社サイトはページごとに 1 件）" />
          <StatCard label="一致" value={data.summary.match} unit="項目" hint="全角 / 半角・空白・ハイフン・法人格の略記の違いは一致とみなす" />
          <StatCard label="不一致" value={data.summary.mismatch} unit="項目" hint={fails.length > 0 ? "下の「直すべき箇所」を上から直す" : "食い違いはありません"} />
          <StatCard label="記載なし" value={data.summary.missing} unit="項目" hint="書かれていないか、自動では読めない書き方" />
        </div>
      </Card>

      {data.jsonLdSuggestion && (
        <Card
          title="サイトに貼る構造化データ（JSON-LD）"
          description="自社サイトに構造化データが無いか、正と違う値が入っています。この内容をトップページの <head> に貼ると、検索エンジンと生成 AI が正の NAP を読めるようになります。営業時間・説明文まで入れたものは「掲載」タブの「掲載先に登録する」で作れます。"
          actions={<CopyButton text={data.jsonLdSuggestion} variant="ghost" resetMs={1500} />}
        >
          <pre className="max-h-80 overflow-auto rounded-md border border-line bg-panel p-3 font-mono text-[12px] leading-relaxed text-ink">{data.jsonLdSuggestion}</pre>
        </Card>
      )}

      <Card title="確認していないこと・注意">
        <ul className="list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-muted">
          {data.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
          <li>「記載なし」は「載っていない」と「自動では読めない書き方（画像・JavaScript で描かれた文字など）」の両方を含みます。要確認の行はページを開いて目で確かめてください。</li>
        </ul>
      </Card>
    </>
  );
}

export function NapTool() {
  const { form, website, overridden, stores, storeId, applyStore, edit, reset } = useStoreProfileForm();
  const [history] = useStore(napHistoryStore);
  const [view, setView] = useState<{ kind: "run" } | { kind: "history"; id: string }>({ kind: "run" });
  const { state, run } = useToolRun<NapCheckResult>();
  const running = state.phase === "running";

  // 店名は必須。加えて突き合わせる先が 1 つは要る（サイト・住所・電話のどれか）
  const hasTarget = Boolean(website.trim() || form.address.trim() || form.phone.trim());
  const canRun = missingFields({ name: form.name, phone: form.phone, address: form.address, website }).length === 0 && hasTarget && !running;

  async function submit() {
    if (!canRun) return;
    const data = await run("/api/nap/check", { name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(), website: website.trim() });
    if (data) {
      pushNapHistory(data);
      setView({ kind: "run" });
    }
  }

  const shown: NapCheckResult | null = useMemo(() => {
    if (view.kind === "history") return history.find((h) => h.id === view.id)?.result ?? null;
    return state.phase === "done" ? state.data : null;
  }, [view, history, state]);

  return (
    <div className="space-y-4">
      <Callout tone="info" title="NAP チェックとは">
        <p>
          NAP = 店名（Name）・住所（Address）・電話番号（Phone）。ここに入れた 4 つを「正」として、<strong>自社サイト</strong>（構造化データ・フッター・会社概要・お問い合わせ）、
          <strong>Google マップ</strong>、<strong>掲載ページ</strong>（「掲載」タブで控えた URL と、検索で見つかった媒体のページ）に書かれている値を取りに行き、
          項目ごとに<strong>一致か不一致か</strong>で答えます。網羅的に「どこに載っているか」を探すのではなく、「載っているものがずれていないか」を見る道具です。
          生成 AI と検索エンジンは、複数の媒体で<strong>同じ</strong>基本情報が載っている事業者を「実在する」と判断します。
        </p>
      </Callout>

      <BasicInfoNotice
        value={{ name: form.name, phone: form.phone, address: form.address, website }}
        overridden={overridden}
        onChange={edit}
        onReset={reset}
        action={
          <>
            <Button onClick={() => void submit()} disabled={!canRun}>
              {running ? "確認中…（最大 1〜2 分）" : "掲載状況を確かめる"}
            </Button>
            <span className="text-[11px] text-muted">外部のページを最大 15 ほど開きます。Google マップの詳細 1 回と Google の検索 2 回を使います（数円）。1 分に 1 回まで。</span>
          </>
        }
        storePicker={<StorePicker stores={stores} storeId={storeId} onSelect={applyStore} disabled={running} />}
      />

      {state.phase === "error" && (
        <Callout tone="fail" title="確認できませんでした">
          {state.message}
        </Callout>
      )}

      {view.kind === "history" && shown && (
        <Callout tone="info" title={`履歴の結果を表示しています（${formatDate(shown.checkedAt)}）`}>
          <Button size="sm" variant="ghost" onClick={() => setView({ kind: "run" })}>
            最新の結果に戻る
          </Button>
        </Callout>
      )}

      {shown && <Result data={shown} />}

      {history.length > 0 && (
        <Card title="履歴（この端末）" description="直近 10 回の結果です。直したあとにもう一度チェックして、不一致が減ったことを確かめてください。">
          <ul className="divide-y divide-line border-y border-line">
            {history.map((h: NapHistoryItem) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                <span className="w-36 shrink-0 font-mono text-[12px] text-muted">{formatDate(h.result.checkedAt)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{h.result.input.name}</span>
                <Badge tone={h.result.summary.mismatch > 0 ? "fail" : "pass"} icon={false}>
                  不一致 {h.result.summary.mismatch}
                </Badge>
                <Badge tone="neutral" icon={false}>
                  媒体 {h.result.summary.sources}
                </Badge>
                <Button size="sm" variant="ghost" onClick={() => setView({ kind: "history", id: h.id })}>
                  表示
                </Button>
                <Button size="sm" variant="ghost" onClick={() => removeNapHistory(h.id)}>
                  削除
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
