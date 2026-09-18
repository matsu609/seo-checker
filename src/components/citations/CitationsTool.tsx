"use client";

/**
 * サイテーション（ウェブ上の掲載・言及チェック）の画面。
 *
 * 1. 基本情報（店名・電話・住所・サイト）。設定のホームページと MEO の登録店舗から取り込める
 * 2. 「調べる」→ /api/citations が Google を 3 通りで検索してまとめる
 * 3. サマリー → 主要媒体の掲載状況（見つからなければ基本情報掲載へ）→ 言及しているサイトの一覧（CSV）
 *
 * スニペットは短いので「電話・住所が出ていない」は「載っていない」ではない。画面で必ずそう添える。
 */
import { useEffect, useMemo, useState } from "react";
import type { ListingsStoreItem, ListingsStoresResponse } from "@/app/api/listings/stores/route";
import { useRegisteredSite } from "@/components/site/RegisteredSite";
import { useSharedSettings } from "@/lib/settings/client";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  DataTable,
  EmptyState,
  Field,
  Input,
  Select,
  StatCard,
  type BadgeTone,
  type Column,
} from "@/components/ui";
import { CITATION_KIND_LABELS, type CitationHit, type CitationQueryId, type CitationReport } from "@/lib/citations";
import { csvFileName, downloadCsv } from "@/lib/export/csv";
import { useToolRun } from "@/lib/tools/run";

const QUERY_SHORT: Record<CitationQueryId, string> = { phone: "電話", address: "住所", name: "店名" };

const PHONE_TEXT: Record<CitationHit["phone"], string> = { match: "一致", mismatch: "別の番号（要確認）", absent: "—" };
const PHONE_TONE: Record<CitationHit["phone"], BadgeTone> = { match: "pass", mismatch: "warn", absent: "neutral" };
const KIND_TONE: Record<CitationHit["kind"], BadgeTone> = { own: "info", map: "pass", directory: "pass", review: "pass", sns: "info", media: "info", other: "neutral" };

function siteName(row: CitationHit): string {
  return row.sourceLabel ? `${row.sourceLabel}（${row.domain}）` : row.domain;
}

/** 画面の表と CSV で同じ列・同じ値にする */
const FIELDS = [
  { key: "site", header: "サイト", text: (r: CitationHit) => siteName(r), sort: (r: CitationHit) => siteName(r) },
  { key: "kind", header: "種類", text: (r: CitationHit) => CITATION_KIND_LABELS[r.kind], sort: (r: CitationHit) => CITATION_KIND_LABELS[r.kind] },
  { key: "phone", header: "電話番号", text: (r: CitationHit) => PHONE_TEXT[r.phone], sort: (r: CitationHit) => (r.phone === "match" ? 2 : r.phone === "mismatch" ? 1 : 0) },
  { key: "address", header: "住所", text: (r: CitationHit) => (r.address === "match" ? "一致" : "—"), sort: (r: CitationHit) => (r.address === "match" ? 1 : 0) },
  { key: "foundBy", header: "見つけた検索", text: (r: CitationHit) => r.foundBy.map((q) => QUERY_SHORT[q]).join(" / "), sort: (r: CitationHit) => r.foundBy.length },
  { key: "position", header: "最上位", text: (r: CitationHit) => `${r.bestPosition} 位`, sort: (r: CitationHit) => r.bestPosition, align: "right" as const },
  { key: "pages", header: "ページ数", text: (r: CitationHit) => String(r.pages), sort: (r: CitationHit) => r.pages, align: "right" as const },
  { key: "url", header: "ページ", text: (r: CitationHit) => r.url, sort: (r: CitationHit) => r.url },
] as const;

const COLUMNS: readonly Column<CitationHit>[] = FIELDS.map((f) => {
  const base: Column<CitationHit> = { key: f.key, header: f.header, render: (row) => f.text(row), accessor: (row) => f.sort(row), align: "align" in f ? f.align : undefined, sortable: true };
  if (f.key === "site") {
    base.render = (row) => (
      <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline" title={row.title}>
        {siteName(row)}
      </a>
    );
    base.nowrap = true;
  }
  if (f.key === "kind") base.render = (row) => <Badge tone={KIND_TONE[row.kind]} icon={false}>{CITATION_KIND_LABELS[row.kind]}</Badge>;
  if (f.key === "phone") base.render = (row) => <Badge tone={PHONE_TONE[row.phone]} icon={false}>{PHONE_TEXT[row.phone]}</Badge>;
  if (f.key === "address") base.render = (row) => (row.address === "match" ? <Badge tone="pass" icon={false}>一致</Badge> : <span className="text-muted">—</span>);
  if (f.key === "url") base.render = (row) => <span className="line-clamp-1 break-all text-[12px] text-muted" title={row.title}>{row.title || row.url}</span>;
  return base;
});

const CSV_COLUMNS = FIELDS.map((f) => ({ header: f.header, value: (row: CitationHit) => f.text(row) }));

interface Form {
  name: string;
  phone: string;
  address: string;
  website: string;
}

function formFromStore(item: ListingsStoreItem, fallbackWebsite: string): Form {
  const p = item.record?.profile;
  const g = item.google;
  return {
    name: p?.name || g?.name || item.name,
    phone: p?.phone || g?.phone || "",
    address: p?.address || g?.address || "",
    website: p?.website || g?.website || fallbackWebsite,
  };
}

export function CitationsTool() {
  const site = useRegisteredSite();
  // 店名・電話・住所は設定の「会社・店舗の基本情報」（登録時のデータ）が初期値。触ったら edits を使う
  const shared = useSharedSettings();
  const [edits, setEdits] = useState<Form | null>(null);
  const form: Form = edits ?? {
    name: shared.lead?.company ?? "",
    phone: shared.lead?.phone ?? "",
    address: shared.lead?.address ?? "",
    website: "",
  };
  const setForm = (next: Form) => setEdits(next);
  const [websiteTouched, setWebsiteTouched] = useState(false);
  const [stores, setStores] = useState<ListingsStoreItem[]>([]);
  const [storeId, setStoreId] = useState("");
  const { state, run } = useToolRun<CitationReport & { cached?: boolean }>();
  const running = state.phase === "running";

  // MEO の登録店舗（基本情報掲載の保存内容・Google マップの公開情報）。取れなくても画面は動く
  useEffect(() => {
    let alive = true;
    fetch("/api/listings/stores", { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as ListingsStoresResponse) : null))
      .then((d) => alive && d && setStores(d.stores))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const website = websiteTouched || form.website.trim() ? form.website : site.siteUrl;
  const canRun = form.name.trim().length > 0 && !running;

  function applyStore(placeId: string) {
    setStoreId(placeId);
    const item = stores.find((s) => s.placeId === placeId);
    if (!item) return;
    setForm(formFromStore(item, site.siteUrl));
    setWebsiteTouched(true);
  }

  async function submit() {
    if (!canRun) return;
    await run("/api/citations", { name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim(), website: website.trim() });
  }

  const data = state.phase === "done" ? state.data : null;
  const missing = useMemo(() => data?.coverage.filter((c) => !c.found) ?? [], [data]);

  return (
    <div className="space-y-4">
      <Callout tone="info" title="サイテーションとは">
        <p>
          自社の店名・住所・電話番号（NAP）が、自社サイト以外のウェブ（地図・ディレクトリ・口コミ・SNS・メディア）に載っていることです。
          生成 AI と検索エンジンは、複数の媒体で<strong>同じ基本情報</strong>が載っている事業者を「実在する」と認識して回答に含めます。
          ここでは Google を 3 通り（店名 + 電話番号 / 店名 + 住所 / 店名）で検索し、どこに載っているか・食い違いが無いかを一覧にします。
        </p>
      </Callout>

      <Card
        title="基本情報"
        description="基本情報掲載で決めた内容と同じにしてください。電話番号・住所が空でも店名だけで調べられます（その分、見つかるサイトは減ります）。"
        actions={
          stores.length > 0 ? (
            <Field label="MEO の登録店舗から取り込む" className="min-w-[16rem]">
              <Select value={storeId} onChange={(e) => applyStore(e.target.value)} disabled={running}>
                <option value="">選択…</option>
                {stores.map((s) => (
                  <option key={s.placeId} value={s.placeId}>
                    {s.record?.profile.name || s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : undefined
        }
      >
        <div className="grid gap-3 @2xl:grid-cols-2">
          <Field label="店名・屋号（必須）" hint="Google マップの表記と同じにする">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 〇〇歯科クリニック" disabled={running} />
          </Field>
          <Field label="電話番号" hint="例: 03-1234-5678">
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="03-1234-5678" disabled={running} />
          </Field>
          <Field label="住所" hint="番地まで。建物名は自動で外して検索します">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="東京都千代田区丸の内1-1-1 〇〇ビル3F" disabled={running} />
          </Field>
          <Field label="自社サイトの URL" hint="設定に登録したホームページを初期値にします。自社サイト以外の言及だけを数えます">
            <Input
              value={website}
              onChange={(e) => {
                setWebsiteTouched(true);
                setForm({ ...form, website: e.target.value });
              }}
              placeholder="https://example.co.jp/"
              disabled={running}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button onClick={() => void submit()} disabled={!canRun}>
            {running ? "検索中…" : "調べる"}
          </Button>
          <span className="text-[11px] text-muted">Google の検索を最大 3 回使います（数円）。同じ条件は 24 時間、前回の結果を返します。</span>
        </div>
      </Card>

      {state.phase === "error" && (
        <Callout tone="fail" title="取得できませんでした">
          {state.message}
        </Callout>
      )}

      {data && (
        <>
          <Card title="サマリー" description={data.cached ? "24 時間以内の結果を表示しています。" : undefined}>
            <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
              <StatCard label="言及しているサイト" value={data.summary.sites} unit="件" hint="自社サイト以外。1 サイト 1 件で数える" />
              <StatCard label="電話番号が一致" value={data.summary.phoneMatch} unit="件" hint={data.summary.phoneMismatch > 0 ? `別の番号が出ているサイト ${data.summary.phoneMismatch} 件` : "検索結果の文中で確認できたもの"} />
              <StatCard label="住所が一致" value={data.summary.addressMatch} unit="件" hint="検索結果の文中で確認できたもの" />
              <StatCard label="主要媒体の掲載" value={`${data.summary.mediaFound} / ${data.summary.mediaTotal}`} hint="検索結果に出る媒体だけを数える" />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              電話番号・住所の一致は、検索結果に出た短い文（タイトルとスニペット）の中だけで見ています。「—」は「載っていない」ではなく「短い文には出ていない」です。
              「別の番号（要確認）」は、そのサイトの文中に基本情報と違う電話番号が出ていた状態です。複数店舗をまとめたページでも起こるので、ページを開いて確かめてください。
              {!data.summary.ownFound && data.input.website.trim() && " 自社サイトは今回の検索結果には出ていません（店名で検索して 30 位以内に無い場合はここに出ません）。"}
            </p>
          </Card>

          <Card
            title="主要媒体の掲載状況"
            description="通常の検索結果に出てくる媒体だけを数えています。地図アプリ（Google / Apple / Bing など）は登録していても検索結果にほとんど出ないので、ここには出しません。掲載状況は基本情報掲載で管理してください。"
            actions={
              <ButtonLink href="/tools/listings" size="sm" variant="secondary">
                基本情報掲載を開く
              </ButtonLink>
            }
          >
            <ul className="divide-y divide-line border-y border-line">
              {data.coverage.map((c) => (
                <li key={c.mediaId} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
                  <Badge tone={c.found ? "pass" : "neutral"} icon={false}>
                    {c.found ? "見つかった" : "見つからない"}
                  </Badge>
                  <span className="min-w-0 flex-1 text-ink">{c.name}</span>
                  {c.priority === 3 && <Badge tone="info" icon={false}>必須</Badge>}
                  {c.url ? (
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent underline-offset-2 hover:underline">
                      掲載ページを開く
                    </a>
                  ) : (
                    <a href={c.registerUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] text-accent underline-offset-2 hover:underline">
                      登録画面を開く
                    </a>
                  )}
                </li>
              ))}
            </ul>
            {missing.length > 0 && (
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                見つからない媒体は、未登録か、登録していても店名の表記が違う可能性があります。基本情報掲載の「登録画面を開く」から、ここと同じ店名・住所・電話番号で登録してください。
              </p>
            )}
          </Card>

          <Card
            title="言及しているサイト"
            description="検索で見つかったサイトを 1 サイト 1 行にまとめています（自社サイトは最後）。種類が「その他」のサイトは、内容を開いて確かめてください。"
            actions={
              <Button size="sm" variant="ghost" onClick={() => downloadCsv(csvFileName(`citations-${data.input.name}`, new Date()), CSV_COLUMNS, data.hits)}>
                CSV
              </Button>
            }
          >
            {data.hits.length === 0 ? (
              <EmptyState title="言及しているサイトが見つかりませんでした" description="店名の表記（Google マップと同じか）と電話番号を確かめ、基本情報掲載から主要媒体への登録を進めてください。" />
            ) : (
              <DataTable columns={COLUMNS} rows={data.hits} rowKey={(r) => r.domain} stickyHeader />
            )}
          </Card>

          <Card title="使った検索">
            <ul className="space-y-1 text-[12px] text-muted">
              {data.queries.map((q) => (
                <li key={q.id} className="flex flex-wrap gap-x-2">
                  <span className="font-bold text-ink">{q.label}</span>
                  {q.q ? <code className="font-mono">{q.q}</code> : <span>（電話番号・住所が空のため実行していません）</span>}
                  {q.results !== null && <span>{q.results} 件</span>}
                  {q.error && <span className="text-fail">{q.error}</span>}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
