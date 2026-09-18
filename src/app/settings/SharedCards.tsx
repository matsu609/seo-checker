"use client";

/**
 * 設定画面の「全ツール共通の基本情報」カード。
 *
 * 利用者の指示（2026-09-19）: SEO・MEO・AIO で同じ基本設定を何度も入力させない。
 * アカウント登録時のデータ（会社名・担当者名・電話・店舗の種類）も自動で参照し、
 * 書き換えはこの画面でできるようにする。各ツールは細かい変更だけを持つ。
 *
 *   - BusinessCard  … 会社・店舗の基本情報（Clerk の登録情報。/api/account/lead）
 *   - KeywordsCard  … 対策キーワード（順位計測の rankKeywords ストアと共通。精密診断・AI 検索モニタリングも参照）
 *   - StoresCard    … Google マップの店舗（MEO で登録したもの。ここでは一覧と導線だけ）
 */
import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { saveLeadProfile, useLeadProfile } from "@/lib/account/lead-client";
import { ADDRESS_MAX, COMPANY_MAX, CONTACT_NAME_MAX, LeadProfileSchema, PHONE_MAX, REGION_MAX, STORE_TYPES, type LeadProfile } from "@/lib/free/lead";
import { addKeywords, DEVICE_LABELS, rankKeywordsStore, removeKeyword, type RankKeyword } from "@/lib/rank/store";
import { splitList } from "@/lib/store";
import { useCurrentProject, useStore } from "@/lib/store/hooks";

/** 各ツールから直接飛ぶためのカード id（/settings#keywords など） */
export const BUSINESS_ANCHOR = "business";
export const KEYWORDS_ANCHOR = "keywords";
export const STORES_ANCHOR = "stores";

/* ───────────────────── 会社・店舗の基本情報 ───────────────────── */

interface BusinessDraft {
  company: string;
  contactName: string;
  phone: string;
  storeType: string;
  address: string;
  region: string;
}

const EMPTY_BUSINESS: BusinessDraft = { company: "", contactName: "", phone: "", storeType: "", address: "", region: "" };

function draftFromLead(lead: LeadProfile | null): BusinessDraft {
  if (!lead) return EMPTY_BUSINESS;
  return { company: lead.company, contactName: lead.contactName, phone: lead.phone, storeType: lead.storeType, address: lead.address, region: lead.region };
}

export function BusinessCard() {
  const { lead, loaded, error: loadError } = useLeadProfile();
  // 読み込んだ値を初期値にし、利用者が触ったら（edits）そちらを出す。effect で state を作らない
  const [edits, setEdits] = useState<BusinessDraft | null>(null);
  const draft = edits ?? draftFromLead(lead);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  function patch(next: Partial<BusinessDraft>) {
    setEdits({ ...draft, ...next });
    setSaved(false);
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = LeadProfileSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "入力が正しくありません");
      return;
    }
    setBusy(true);
    try {
      const next = await saveLeadProfile(parsed.data);
      setEdits(draftFromLead(next));
      setSaved(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      id={BUSINESS_ANCHOR}
      title="会社・店舗の基本情報"
      description="アカウント登録時に入力した内容です。精密診断の業種・地域、サイテーション調査と基本情報掲載の店名・電話・住所、llms.txt の会社情報、AI 検索モニタリングのブランド名の初期値として全ツールが使います。ここで直せば各ツールにも反映されます。"
      actions={loaded && lead ? <Badge tone="pass" icon={false}>登録済み</Badge> : loaded ? <Badge tone="warn" icon={false}>未登録</Badge> : null}
    >
      {loadError && (
        <Callout tone="warn" className="mb-4">
          登録情報を読み込めませんでした（{loadError}）。入力して保存すると上書きします。
        </Callout>
      )}
      <form onSubmit={onSubmit} className="grid gap-4 @2xl:grid-cols-2">
        <Field label="会社名（屋号）" htmlFor="biz-company" required hint="サイト名を空欄にしたとき、この名前をブランド名として使います">
          <Input id="biz-company" value={draft.company} maxLength={COMPANY_MAX} autoComplete="organization" onChange={(e) => patch({ company: e.target.value })} />
        </Field>
        <Field label="担当者名" htmlFor="biz-contact" required>
          <Input id="biz-contact" value={draft.contactName} maxLength={CONTACT_NAME_MAX} autoComplete="name" onChange={(e) => patch({ contactName: e.target.value })} />
        </Field>
        <Field label="電話番号" htmlFor="biz-phone" required hint="サイテーション調査・基本情報掲載の初期値">
          <Input id="biz-phone" value={draft.phone} maxLength={PHONE_MAX} inputMode="tel" autoComplete="tel" onChange={(e) => patch({ phone: e.target.value })} />
        </Field>
        <Field label="店舗の種類（業種）" htmlFor="biz-type" required hint="精密診断・基本情報掲載の業種の初期値">
          <Select id="biz-type" value={draft.storeType} onChange={(e) => patch({ storeType: e.target.value })}>
            <option value="">選んでください</option>
            {STORE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="所在地（任意）" htmlFor="biz-address" hint="サイテーション調査・基本情報掲載・llms.txt の初期値">
          <Input id="biz-address" value={draft.address} maxLength={ADDRESS_MAX} autoComplete="street-address" placeholder="東京都千代田区丸の内1-1-1 〇〇ビル3F" onChange={(e) => patch({ address: e.target.value })} />
        </Field>
        <Field label="地域・商圏（任意）" htmlFor="biz-region" hint="精密診断・ページ診断の「地域」の初期値。例: 東京都世田谷区">
          <Input id="biz-region" value={draft.region} maxLength={REGION_MAX} placeholder="東京都世田谷区" onChange={(e) => patch({ region: e.target.value })} />
        </Field>
        <div className="flex flex-wrap items-center gap-2 @2xl:col-span-2">
          <Button type="submit" loading={busy} disabled={!loaded}>
            保存する
          </Button>
          {error && <span className="text-[13px] text-fail">{error}</span>}
          {saved && !error && <span className="text-[13px] text-pass">保存しました。各ツールを開き直すと反映されます。</span>}
        </div>
      </form>
    </Card>
  );
}

/* ───────────────────── 対策キーワード ───────────────────── */

const RANK_HREF = "/tools/rank";

export function KeywordsCard() {
  const { project } = useCurrentProject();
  const [all] = useStore(rankKeywordsStore);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const rows = useMemo(() => {
    if (!project) return [] as { keyword: string; items: RankKeyword[] }[];
    const byKeyword = new Map<string, RankKeyword[]>();
    for (const k of all) {
      if (k.projectId !== project.id) continue;
      const list = byKeyword.get(k.keyword) ?? [];
      list.push(k);
      byKeyword.set(k.keyword, list);
    }
    return [...byKeyword.entries()].map(([keyword, items]) => ({ keyword, items }));
  }, [all, project]);

  if (!project) {
    return (
      <Card id={KEYWORDS_ANCHOR} title="対策キーワード" description="順位計測・精密診断・AI 検索モニタリングが共通で使うキーワードです。">
        <EmptyState title="先にホームページを登録してください" description="キーワードは、対象にしているホームページごとに保存します。" />
      </Card>
    );
  }

  function submit() {
    const lines = splitList(text);
    if (lines.length === 0) {
      setNotice("キーワードを入力してください。");
      return;
    }
    const added = addKeywords(lines, { projectId: project!.id, device: "desktop" });
    setText("");
    setNotice(added.length === lines.length ? `${added.length} 件を登録しました。` : `${added.length} 件を登録しました（${lines.length - added.length} 件は登録済みのため省略）。`);
  }

  return (
    <Card
      id={KEYWORDS_ANCHOR}
      title="対策キーワード"
      description={`「${project.name}」で狙うキーワード。順位計測（Google 順位・AI Overviews）、精密診断（順位と検索結果の特徴）、AI 検索モニタリング（検索キーワード）が共通で使います。デバイス・地域・目標ページなどの細かい設定は順位計測で変えられます。`}
      actions={
        <ButtonLink href={RANK_HREF} size="sm" variant="ghost">
          順位計測で細かく設定する
        </ButtonLink>
      }
    >
      <div className="grid gap-4 @2xl:grid-cols-[1fr_14rem]">
        <Field label="キーワードを追加" htmlFor="shared-kw" hint="1 行に 1 つ（カンマ区切りも可）。登録済みのものは飛ばします">
          <Textarea id="shared-kw" rows={3} value={text} placeholder={"世田谷区 歯医者\n歯科 矯正 費用"} onChange={(e) => setText(e.target.value)} />
        </Field>
        <div className="flex items-end">
          <Button type="button" onClick={submit}>
            登録する
          </Button>
        </div>
      </div>
      {notice && <p className="mt-2 text-[13px] text-muted">{notice}</p>}

      <ul className="mt-4 divide-y divide-line border-y border-line">
        {rows.map(({ keyword, items }) => (
          <li key={keyword} className="flex flex-wrap items-center gap-2 py-2 text-[13px]">
            <span className="min-w-0 flex-1 text-ink">{keyword}</span>
            <span className="text-[11px] text-muted">
              {items.map((k) => `${DEVICE_LABELS[k.device]}${k.location ? `・${k.location}` : ""}`).join(" / ")}
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                for (const k of items) removeKeyword(k.id);
                setNotice(null);
              }}
            >
              削除
            </Button>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-[13px] text-muted">まだ登録がありません。</li>}
      </ul>
    </Card>
  );
}

/* ───────────────────── Google マップの店舗（MEO） ───────────────────── */

interface StoreRow {
  placeId: string;
  name: string;
  role: "own" | "competitor";
  ownPlaceId: string;
}

const MAPS_HREF = "/tools/maps";

export function StoresCard() {
  const [stores, setStores] = useState<StoreRow[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetch("/api/maps/stores", { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        // プランに MEO が無い（403）・未ログイン・未設定のときはカードごと出さない
        if (!res.ok) {
          setStores(null);
          return;
        }
        const body = (await res.json()) as { stores?: StoreRow[] };
        setStores(body.stores ?? []);
      })
      .catch(() => alive && setStores(null));
    return () => {
      alive = false;
    };
  }, []);

  if (stores === undefined || stores === null) return null;
  const owns = stores.filter((s) => s.role === "own");

  return (
    <Card
      id={STORES_ANCHOR}
      title="Google マップの店舗（MEO）"
      description="MEO で登録した自社店舗と競合です。基本情報掲載・サイテーション調査・口コミの各ツールはこの店舗を使います。店舗の追加・削除は MEO の画面で行います（Google マップから探して登録するため）。"
      actions={
        <ButtonLink href={MAPS_HREF} size="sm" variant="ghost">
          MEO で店舗を登録・変更する
        </ButtonLink>
      }
    >
      {owns.length === 0 ? (
        <EmptyState
          title="店舗はまだ登録されていません"
          description={
            <>
              <Link href={MAPS_HREF} className="font-bold text-accent underline underline-offset-2">
                MEO
              </Link>
              で店名や地域から探して自社店舗を登録すると、ここに出ます。
            </>
          }
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {owns.map((own) => {
            const competitors = stores.filter((s) => s.role === "competitor" && s.ownPlaceId === own.placeId);
            return (
              <li key={own.placeId} className="py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info" icon={false}>自社</Badge>
                  <span className="font-bold text-ink">{own.name}</span>
                </div>
                {competitors.length > 0 && (
                  <p className="mt-1 pl-1 text-[12px] text-muted">競合: {competitors.map((c) => c.name).join("、")}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
