"use client";

/**
 * 基本情報掲載（NAP 一括登録）。
 *
 * 1. 店舗を選ぶ（MEO の自社店舗）。掲載状況の集計
 * 2. 基本情報（正）を決める: Google マップの公開情報から取り込み → 表記ゆれの確認 → AI で説明文 → 保存
 * 3. 媒体一覧: 無料で自分で登録できる媒体は登録画面へ。自動で流れる媒体・配信代行のみの媒体は区別して表示。
 *    媒体ごとに状況（未登録 / 申請中 / 掲載済み / 対象外）・掲載 URL・メモを控える
 * 4. サイトに貼る構造化データ（LocalBusiness）
 *
 * 無料で全媒体に一斉登録できる API は存在しない（Uberall / Yext などの配信代行は有料）。
 * このツールは「1 か所で決めた内容を、各媒体にそのまま貼る」手間を最小にし、掲載状況を管理する。
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ListingsDescribeResponse } from "@/app/api/listings/describe/route";
import type { ListingsProfileResponse } from "@/app/api/listings/profile/route";
import type { ListingsStoreItem, ListingsStoresResponse } from "@/app/api/listings/stores/route";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { HINT_MAX } from "@/lib/listings/constants";
import { LISTING_MEDIA, MEDIA_KIND_DESCRIPTIONS, MEDIA_KIND_LABELS, mediaById, mediaOfKind, type ListingMedia, type MediaKind } from "@/lib/listings/media";
import {
  ADDRESS_MAX,
  CATEGORY_MAX,
  compareNap,
  EMAIL_MAX,
  emptyProfile,
  HOURS_MAX,
  jsonLdScript,
  LISTING_NOTE_MAX,
  LISTING_STATUS_LABELS,
  LISTING_STATUSES,
  LISTING_URL_MAX,
  LONG_DESCRIPTION_MAX,
  NAME_MAX,
  PHONE_MAX,
  POSTAL_MAX,
  prefillFromGoogle,
  profileToText,
  SHORT_DESCRIPTION_MAX,
  stateOf,
  summarizeStates,
  URL_MAX,
  type ListingProfile,
  type ListingStates,
  type ListingStatus,
} from "@/lib/listings/profile";
import { formatDateTime } from "@/lib/report/format";

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答
  }
  return `リクエストに失敗しました（HTTP ${res.status}）`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const KINDS: readonly MediaKind[] = ["self", "fed", "aggregator"];

const STATUS_TONE: Record<ListingStatus, "neutral" | "warn" | "pass" | "info"> = { todo: "neutral", submitted: "warn", live: "pass", skip: "info" };

export function ListingsTool() {
  const [data, setData] = useState<ListingsStoresResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [placeId, setPlaceId] = useState<string>("");
  const [profile, setProfile] = useState<ListingProfile>(emptyProfile());
  const [states, setStates] = useState<ListingStates>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  /** 選んだ店舗の記録を画面に読み込む */
  function selectStore(item: ListingsStoreItem | null) {
    setPlaceId(item?.placeId ?? "");
    setProfile(item?.record?.profile ?? emptyProfile());
    setStates(item?.record?.states ?? {});
    setSavedAt(item?.record?.updatedAt ?? null);
    setDirty(false);
    setSaveError(null);
    setSaveMessage(null);
  }

  useEffect(() => {
    let alive = true;
    request<ListingsStoresResponse>("/api/listings/stores")
      .then((d) => {
        if (!alive) return;
        setData(d);
        const first = d.stores[0] ?? null;
        selectStore(first);
      })
      .catch((err) => alive && setLoadError(err instanceof Error ? err.message : "読み込みに失敗しました"));
    return () => {
      alive = false;
    };
  }, []);

  const store = useMemo(() => data?.stores.find((s) => s.placeId === placeId) ?? null, [data, placeId]);
  const mismatches = useMemo(() => (store?.google ? compareNap(profile, store.google) : []), [profile, store]);
  const summary = useMemo(() => summarizeStates(states), [states]);
  const text = useMemo(() => profileToText(profile), [profile]);
  const jsonLd = useMemo(() => jsonLdScript(profile), [profile]);

  function update<K extends keyof ListingProfile>(key: K, value: ListingProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
    setDirty(true);
    setSaveMessage(null);
  }

  function updateState(mediaId: string, patch: Partial<{ status: ListingStatus; url: string; note: string }>) {
    setStates((prev) => ({ ...prev, [mediaId]: { ...stateOf(prev, mediaId), ...patch, updatedAt: new Date().toISOString() } }));
    setDirty(true);
    setSaveMessage(null);
  }

  function importFromGoogle() {
    if (!store?.google) return;
    setProfile((p) => prefillFromGoogle(p, store.google!));
    setDirty(true);
  }

  async function save() {
    if (!store) return;
    setSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const res = await request<ListingsProfileResponse>("/api/listings/profile", { method: "PUT", body: JSON.stringify({ placeId: store.placeId, profile, states }) });
      setProfile(res.record.profile);
      setStates(res.record.states);
      setSavedAt(res.record.updatedAt);
      setDirty(false);
      setSaveMessage("保存しました。");
      setData((d) => (d ? { ...d, stores: d.stores.map((s) => (s.placeId === store.placeId ? { ...s, record: res.record } : s)) } : d));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function describe() {
    if (!store) return;
    setDescribing(true);
    setDescribeError(null);
    try {
      const res = await request<ListingsDescribeResponse>("/api/listings/describe", {
        method: "POST",
        body: JSON.stringify({
          profile,
          google: store.google ? { category: store.google.category, hours: store.google.hours, reviews: store.google.reviews } : null,
          hint,
        }),
      });
      setProfile((p) => ({ ...p, shortDescription: res.short, longDescription: res.long }));
      setDirty(true);
    } catch (err) {
      setDescribeError(err instanceof Error ? err.message : "説明文を作れませんでした");
    } finally {
      setDescribing(false);
    }
  }

  async function copy(key: string, value: string) {
    setCopied((await copyText(value)) ? key : null);
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
  }

  if (loadError) {
    return (
      <Callout tone="fail" title="読み込めませんでした">
        {loadError}
      </Callout>
    );
  }

  return (
    <div className="space-y-6">
      <Callout tone="info" title="この機能でできること・できないこと">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            店名・住所・電話・営業時間・説明文を 1 か所で決め、各媒体に同じ内容で載せます（表記ゆれが無いことが、地図・検索・生成 AI に正しく認識される条件です）。
          </li>
          <li>
            <strong>無料で自分で登録できる媒体</strong>（Google / Apple / Bing / Yahoo!プレイス / Foursquare / HERE / TomTom / Waze / OpenStreetMap など）は、登録画面へ直接進み、下の基本情報をコピーして貼り付けます。
          </li>
          <li>
            <strong>無料で全媒体にワンクリック登録できる仕組みはありません。</strong>「一括同期」ができるのは Uberall や Yext などの配信代行サービス（有料。店舗ごとに月額）だけで、Acompio や Opendi などはその経由でしか載りません。Siri やカーナビ各社は Apple / HERE / TomTom に載せると自動で流れます。
          </li>
        </ul>
      </Callout>

      <Card number={1} title="店舗と掲載状況" description="基本情報掲載の対象は MEO の自社店舗です。店舗ごとに基本情報と掲載状況を持ちます。">
        {!data ? (
          <p className="text-[13px] text-muted">読み込んでいます…</p>
        ) : data.stores.length === 0 ? (
          <EmptyState
            title="自社店舗がまだ登録されていません"
            description="Google マップ・店舗情報（MEO）で自社店舗を登録すると、ここに出ます。"
            action={<ButtonLink href="/tools/maps">MEO で店舗を登録する</ButtonLink>}
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Field label="店舗" htmlFor="listing-store">
              <Select id="listing-store" value={placeId} onChange={(e) => selectStore(data.stores.find((s) => s.placeId === e.target.value) ?? null)}>
                {data.stores.map((s) => (
                  <option key={s.placeId} value={s.placeId}>
                    {s.name}
                    {s.record ? "" : "（未設定）"}
                  </option>
                ))}
              </Select>
            </Field>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 pb-3 text-[13px]">
              <div>
                <dt className="text-muted">自分で登録できる媒体</dt>
                <dd className="font-bold text-ink">
                  {summary.selfLive} / {summary.selfTotal} 掲載済み
                </dd>
              </div>
              <div>
                <dt className="text-muted">全媒体</dt>
                <dd className="font-bold text-ink">
                  {summary.live} 掲載済み・{summary.submitted} 申請中・{summary.todo} 未登録
                </dd>
              </div>
              {savedAt && (
                <div>
                  <dt className="text-muted">最終保存</dt>
                  <dd className="text-ink">{formatDateTime(savedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </Card>

      {store && (
        <>
          <Card
            number={2}
            title="基本情報（正）"
            description="ここで決めた内容をすべての媒体に載せます。Google マップの公開情報から取り込んで、違う点だけ直すのが早いです。"
            actions={
              store.google ? (
                <Button type="button" size="sm" variant="secondary" onClick={importFromGoogle}>
                  Google マップから取り込む
                </Button>
              ) : undefined
            }
          >
            {!store.google && (
              <Callout tone="info" className="mb-4">
                この店舗の Google マップの公開情報（MEO の報告書）がまだありません。MEO の一斉更新のあと、取り込みと表記ゆれの確認ができます。
              </Callout>
            )}
            {mismatches.length > 0 && (
              <Callout tone="warn" title="Google マップの表記と違う項目があります" className="mb-4">
                <ul className="list-disc space-y-1 pl-5">
                  {mismatches.map((m) => (
                    <li key={m.field}>
                      <strong>{m.label}</strong>: ここ「{m.profile}」／ Google「{m.google}」。どちらかに揃えてください（Google 側を直すなら
                      <a href="https://business.google.com/" target="_blank" rel="noopener noreferrer" className="underline">
                        ビジネス プロフィール
                      </a>
                      ）。
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="店名" htmlFor="lp-name" required hint="すべての媒体でこの表記に統一（全角 / 半角、スペース、支店名の付け方）">
                <Input id="lp-name" maxLength={NAME_MAX} value={profile.name} onChange={(e) => update("name", e.target.value)} />
              </Field>
              <Field label="ふりがな" htmlFor="lp-kana" hint="Yahoo!プレイスなど日本の媒体で要ります">
                <Input id="lp-kana" maxLength={NAME_MAX} value={profile.nameKana} onChange={(e) => update("nameKana", e.target.value)} />
              </Field>
              <Field label="業種（カテゴリ）" htmlFor="lp-category" hint="Google のメインカテゴリと同じ言葉に">
                <Input id="lp-category" maxLength={CATEGORY_MAX} value={profile.category} onChange={(e) => update("category", e.target.value)} />
              </Field>
              <Field label="電話番号" htmlFor="lp-phone" hint="ハイフンの有無も統一">
                <Input id="lp-phone" maxLength={PHONE_MAX} value={profile.phone} onChange={(e) => update("phone", e.target.value)} />
              </Field>
              <Field label="郵便番号" htmlFor="lp-postal">
                <Input id="lp-postal" maxLength={POSTAL_MAX} value={profile.postalCode} onChange={(e) => update("postalCode", e.target.value)} />
              </Field>
              <Field label="住所" htmlFor="lp-address" hint="都道府県から建物名・階まで">
                <Input id="lp-address" maxLength={ADDRESS_MAX} value={profile.address} onChange={(e) => update("address", e.target.value)} />
              </Field>
              <Field label="サイト" htmlFor="lp-website" hint="https:// から">
                <Input id="lp-website" maxLength={URL_MAX} value={profile.website} onChange={(e) => update("website", e.target.value)} placeholder="https://" />
              </Field>
              <Field label="メール（任意）" htmlFor="lp-email">
                <Input id="lp-email" maxLength={EMAIL_MAX} value={profile.email} onChange={(e) => update("email", e.target.value)} />
              </Field>
            </div>
            <Field label="営業時間" htmlFor="lp-hours" hint="1 行 1 曜日（例: 月曜日: 10:00〜19:00、日曜日: 定休日）。構造化データにも使います" className="mt-4">
              <Textarea id="lp-hours" rows={7} maxLength={HOURS_MAX} value={profile.hours} onChange={(e) => update("hours", e.target.value)} />
            </Field>

            <div className="mt-4 rounded-sm border border-line bg-surface p-4">
              <h3 className="text-[13px] font-bold text-ink">説明文</h3>
              <p className="mt-1 text-[12px] text-muted">
                生成 AI や検索エンジンが「何の店か」を理解する材料です。1 文目に店名・業種・地名。最上級や約束は書かないでください。
              </p>
              {data?.anthropic && (
                <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <Field label="AI への補足（任意）" htmlFor="lp-hint" hint="こだわり・利用シーン・アクセスなど。無くても作れます">
                    <Input id="lp-hint" maxLength={HINT_MAX} value={hint} onChange={(e) => setHint(e.target.value)} />
                  </Field>
                  <div className="pb-3">
                    <Button type="button" size="sm" variant="secondary" onClick={describe} loading={describing} disabled={!profile.name.trim()}>
                      AI で説明文を作る
                    </Button>
                  </div>
                </div>
              )}
              {describeError && (
                <Callout tone="fail" className="mt-3">
                  {describeError}
                </Callout>
              )}
              <div className="mt-3 grid gap-4">
                <Field label={`短い説明（${profile.shortDescription.length} / ${SHORT_DESCRIPTION_MAX}）`} htmlFor="lp-short" hint="ディレクトリの一覧に出る 1〜2 文">
                  <Textarea id="lp-short" rows={3} maxLength={SHORT_DESCRIPTION_MAX} value={profile.shortDescription} onChange={(e) => update("shortDescription", e.target.value)} />
                </Field>
                <Field label={`説明文（${profile.longDescription.length} / ${LONG_DESCRIPTION_MAX}）`} htmlFor="lp-long" hint="Google / Yahoo! / Apple の説明文（750 文字まで）">
                  <Textarea id="lp-long" rows={8} maxLength={LONG_DESCRIPTION_MAX} value={profile.longDescription} onChange={(e) => update("longDescription", e.target.value)} />
                </Field>
              </div>
            </div>

            {saveError && (
              <Callout tone="fail" className="mt-4">
                {saveError}
              </Callout>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button type="button" onClick={save} loading={saving} disabled={!dirty && savedAt !== null}>
                保存する
              </Button>
              <Button type="button" variant="secondary" onClick={() => copy("all", text)} disabled={!text}>
                {copied === "all" ? "コピーしました" : "基本情報をまとめてコピー"}
              </Button>
              {saveMessage && <span className="text-[13px] text-pass">{saveMessage}</span>}
              {dirty && !saveMessage && <span className="text-[13px] text-muted">未保存の変更があります</span>}
            </div>
          </Card>

          <Card number={3} title="媒体一覧" description="上から順に進めてください。各媒体で「登録画面を開く」→ 基本情報を貼り付け → 状況を控える。保存ボタンは上のカードにあります。">
            <div className="mb-4 flex flex-wrap gap-2">
              {(
                [
                  ["name", "店名", profile.name],
                  ["address", "住所", profile.address],
                  ["phone", "電話", profile.phone],
                  ["website", "サイト", profile.website],
                  ["hours", "営業時間", profile.hours],
                  ["short", "短い説明", profile.shortDescription],
                  ["long", "説明文", profile.longDescription],
                ] as const
              ).map(([key, label, value]) => (
                <Button key={key} type="button" size="sm" variant="ghost" onClick={() => copy(key, value)} disabled={!value}>
                  {copied === key ? "コピーしました" : `${label}をコピー`}
                </Button>
              ))}
            </div>
            <div className="space-y-6">
              {KINDS.map((kind) => (
                <section key={kind}>
                  <h3 className="text-[13px] font-bold text-ink">{MEDIA_KIND_LABELS[kind]}</h3>
                  <p className="mt-1 text-[12px] text-muted">{MEDIA_KIND_DESCRIPTIONS[kind]}</p>
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {mediaOfKind(kind).map((x) => (
                      <MediaRow key={x.id} media={x} status={stateOf(states, x.id)} onChange={(patch) => updateState(x.id, patch)} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </Card>

          <Card
            number={4}
            title="サイトに貼る構造化データ"
            description="自社サイトの <head> か本文の末尾に貼ると、検索エンジンと生成 AI が基本情報（店名・住所・電話・営業時間）を読み取れます。"
            actions={
              <Button type="button" size="sm" variant="secondary" onClick={() => copy("jsonld", jsonLd)}>
                {copied === "jsonld" ? "コピーしました" : "コピー"}
              </Button>
            }
          >
            <Textarea aria-label="構造化データ" rows={12} readOnly value={jsonLd} className="font-mono text-[12px]" />
            <p className="mt-2 text-[12px] text-muted">
              営業時間は「月曜日: 10:00〜19:00」の形の行だけ変換されます。llms.txt も合わせて置くなら
              <Link href="/tools/llms-txt" className="underline">
                llms.txt 生成
              </Link>
              へ。
            </p>
          </Card>
        </>
      )}
      <p className="text-[12px] text-muted">
        媒体は {LISTING_MEDIA.length} 件（自分で登録 {mediaOfKind("self").length}・自動で反映 {mediaOfKind("fed").length}・配信代行のみ {mediaOfKind("aggregator").length}）。
      </p>
    </div>
  );
}

function MediaRow({ media, status, onChange }: { media: ListingMedia; status: ReturnType<typeof stateOf>; onChange: (patch: Partial<{ status: ListingStatus; url: string; note: string }>) => void }) {
  const [open, setOpen] = useState(false);
  const fedBy = (media.fedBy ?? []).map((id) => mediaById(id)?.name ?? id);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink">{media.name}</span>
            <span className="font-mono text-[11px] text-muted">{media.id}</span>
            {media.priority === 3 && <Badge tone="info">必須</Badge>}
            {media.priority === 2 && <Badge tone="neutral">推奨</Badge>}
            <Badge tone={STATUS_TONE[status.status]}>{LISTING_STATUS_LABELS[status.status]}</Badge>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {media.howTo}
            {fedBy.length > 0 && <span> 元の媒体: {fedBy.join("・")}。</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {media.kind === "self" ? (
            <ButtonLink href={media.url} external size="sm">
              登録画面を開く
            </ButtonLink>
          ) : (
            <ButtonLink href={media.url} external size="sm" variant="ghost">
              媒体を見る
            </ButtonLink>
          )}
          <Select aria-label={`${media.name} の状況`} value={status.status} onChange={(e) => onChange({ status: e.target.value as ListingStatus })} className="w-28">
            {LISTING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {LISTING_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "閉じる" : "URL・メモ"}
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Field label="掲載ページの URL" htmlFor={`lm-url-${media.id}`}>
            <Input id={`lm-url-${media.id}`} maxLength={LISTING_URL_MAX} value={status.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://" />
          </Field>
          <Field label="メモ" htmlFor={`lm-note-${media.id}`} hint={status.updatedAt ? `更新: ${formatDateTime(status.updatedAt)}` : undefined}>
            <Input id={`lm-note-${media.id}`} maxLength={LISTING_NOTE_MAX} value={status.note} onChange={(e) => onChange({ note: e.target.value })} />
          </Field>
        </div>
      )}
    </li>
  );
}
