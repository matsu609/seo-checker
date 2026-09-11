"use client";

/**
 * オーナー情報の入力（公開情報では取れない 9 項目の申告）。
 *
 * Google マップの公開情報（Places API）では、説明文・開業日・メニュー・投稿・写真の日付・
 * ロゴ/カバー・返信が取れない。オーナーがここで答えると、最新の報告書がその場で
 * 採点し直される（Google には問い合わせない）。以後の一斉更新にも自動で反映される。
 */
import { useEffect, useState } from "react";
import type { MapsOwnerResponse, MapsOwnerSaveResponse } from "@/app/api/maps/stores/[id]/owner/route";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { MeoHistoryEntry } from "@/lib/maps/history";
import {
  answeredCount,
  DESCRIPTION_MAX,
  emptyOwnerInput,
  MAX_KEYWORDS,
  MAX_POST_TEXT,
  MAX_REPLY_TEXT,
  OWNER_QUESTION_COUNT,
  parseKeywords,
  type MeoOwnerData,
  type MeoOwnerInput,
} from "@/lib/maps/owner-input";
import type { MeoStore } from "@/lib/maps/stores";
import { formatDateTime } from "@/lib/report/format";

export interface OwnerInputCardProps {
  number: number;
  store: MeoStore | null;
  /** Google 上の口コミ件数（返信率の分母。無ければ null） */
  ratingCount: number | null;
  /** 保存・削除のあと、採点し直した報告書を親に返す */
  onSaved: (rescored: MeoHistoryEntry | null, owner: MeoOwnerData | null) => void;
}

type Tri = "" | "yes" | "no";
type DescState = "" | "none" | "set";

/** 画面の入力欄の状態（文字列のまま持ち、保存時に MeoOwnerInput にする） */
interface Draft {
  keywords: string;
  descState: DescState;
  description: string;
  openingDate: Tri;
  menu: Tri;
  posts: string;
  latestPostText: string;
  ownerPhotoLastAt: string;
  logo: Tri;
  cover: Tri;
  replied: string;
  replyText: string;
}

function tri(v: boolean | null): Tri {
  return v === null ? "" : v ? "yes" : "no";
}
function fromTri(v: Tri): boolean | null {
  return v === "" ? null : v === "yes";
}
function num(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function toDraft(input: MeoOwnerInput): Draft {
  return {
    keywords: input.keywords.join(", "),
    descState: input.description === null ? "" : input.description === "" ? "none" : "set",
    description: input.description ?? "",
    openingDate: tri(input.openingDate),
    menu: tri(input.menu),
    posts: input.postsLast4Weeks === null ? "" : String(input.postsLast4Weeks),
    latestPostText: input.latestPostText ?? "",
    ownerPhotoLastAt: input.ownerPhotoLastAt ?? "",
    logo: tri(input.logo),
    cover: tri(input.cover),
    replied: input.repliedReviews === null ? "" : String(input.repliedReviews),
    replyText: input.replyText ?? "",
  };
}

export function fromDraft(d: Draft): MeoOwnerInput {
  const posts = num(d.posts);
  const replied = num(d.replied);
  const postText = d.latestPostText.trim();
  const replyText = d.replyText.trim();
  return {
    keywords: parseKeywords(d.keywords),
    description: d.descState === "" ? null : d.descState === "none" ? "" : d.description.slice(0, DESCRIPTION_MAX),
    openingDate: fromTri(d.openingDate),
    menu: fromTri(d.menu),
    postsLast4Weeks: posts,
    // 本文は「投稿あり」のときだけ意味がある。空欄は未回答
    latestPostText: posts !== null && posts > 0 && postText ? postText.slice(0, MAX_POST_TEXT) : null,
    ownerPhotoLastAt: d.ownerPhotoLastAt.trim() || null,
    logo: fromTri(d.logo),
    cover: fromTri(d.cover),
    repliedReviews: replied,
    replyText: replied !== null && replied > 0 && replyText ? replyText.slice(0, MAX_REPLY_TEXT) : null,
  };
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答
  }
  return `リクエストに失敗しました（HTTP ${res.status}）`;
}

function TriSelect({ value, onChange, yes, no }: { value: Tri; onChange: (v: Tri) => void; yes: string; no: string }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value as Tri)}>
      <option value="">未回答</option>
      <option value="yes">{yes}</option>
      <option value="no">{no}</option>
    </Select>
  );
}

export function OwnerInputCard({ number, store, ratingCount, onSaved }: OwnerInputCardProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(emptyOwnerInput()));
  const [saved, setSaved] = useState<MeoOwnerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const storeId = store?.id ?? null;

  // 店舗が変わったら申告を読み直す（状態のリセットは応答が来てからまとめて行う）
  useEffect(() => {
    if (!storeId) return;
    const ac = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/maps/stores/${encodeURIComponent(storeId)}/owner`, { cache: "no-store", signal: ac.signal });
        if (!res.ok) throw new Error(await errorMessage(res));
        const body = (await res.json()) as MapsOwnerResponse;
        if (ac.signal.aborted) return;
        setSaved(body.owner);
        setDraft(toDraft(body.owner?.input ?? emptyOwnerInput()));
        setOpen(!body.owner);
        setError(null);
        setNotice(null);
      } catch (err) {
        if (ac.signal.aborted) return;
        setSaved(null);
        setDraft(toDraft(emptyOwnerInput()));
        setError(err instanceof Error ? err.message : "オーナー情報を読み込めませんでした");
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => ac.abort();
  }, [storeId]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }));

  async function onSave() {
    if (!storeId) return;
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/maps/stores/${encodeURIComponent(storeId)}/owner`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: fromDraft(draft) }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const body = (await res.json()) as MapsOwnerSaveResponse;
      setSaved(body.owner);
      if (body.owner) setDraft(toDraft(body.owner.input));
      setNotice(body.rescored ? "保存し、最新の報告書を採点し直しました。" : "保存しました。報告書は次回の一斉更新から反映されます。");
      setOpen(false);
      onSaved(body.rescored, body.owner);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!storeId || !window.confirm("オーナー情報を消して、公開情報だけの採点に戻します。よろしいですか？")) return;
    setBusy("delete");
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/maps/stores/${encodeURIComponent(storeId)}/owner`, { method: "DELETE" });
      if (!res.ok) throw new Error(await errorMessage(res));
      const body = (await res.json()) as MapsOwnerSaveResponse;
      setSaved(null);
      setDraft(toDraft(emptyOwnerInput()));
      setNotice("オーナー情報を消しました。");
      onSaved(body.rescored, null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "消せませんでした");
    } finally {
      setBusy(null);
    }
  }

  const answered = answeredCount(fromDraft(draft));
  const posts = num(draft.posts);
  const replied = num(draft.replied);

  return (
    <Card
      number={number}
      title="オーナー情報の入力（公開情報では取れない 9 項目）"
      description="説明文・開業日・メニュー・投稿・写真の更新日・ロゴ/カバー・口コミ返信は、Google マップの公開情報では取れません。ビジネス プロフィールの管理画面を見ながら答えると、その場で報告書を採点し直し、以後の一斉更新にも反映します。答えた項目だけが採点に入ります。"
      className="no-print"
      actions={
        store && !loading ? (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            <span className="tabular-nums">
              {answered} / {OWNER_QUESTION_COUNT} 項目を回答
            </span>
            {saved && <span>（{formatDateTime(saved.updatedAt)} 保存）</span>}
            <Button size="sm" variant="secondary" onClick={() => setOpen((v) => !v)}>
              {open ? "閉じる" : saved ? "編集する" : "入力する"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!store && <EmptyState title="自社の店舗を登録してください" description="自社の店舗を登録すると、ここで 9 項目を入力できます。" />}

      {store && error && (
        <Callout tone="fail" className="mb-4">
          {error}
        </Callout>
      )}
      {store && notice && (
        <Callout tone="info" className="mb-4">
          {notice}
        </Callout>
      )}

      {store && !loading && open && (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void onSave();
          }}
        >
          <Field
            label="対策キーワード（任意・5 つまで）"
            hint="例: 渋谷 美容室、縮毛矯正。カンマ区切り。説明文・投稿・返信・口コミに含まれているかの判定と、Google マップ検索での順位計測（店舗の位置を中心に毎週）に使います"
          >
            <Input value={draft.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="渋谷 美容室, 縮毛矯正, 駅近" maxLength={200} />
          </Field>

          <div className="grid gap-4 @md:grid-cols-2">
            <Field label="1. ビジネスの説明文">
              <Select value={draft.descState} onChange={(e) => set("descState", e.target.value as DescState)}>
                <option value="">未回答</option>
                <option value="set">設定している（下に貼り付け）</option>
                <option value="none">設定していない</option>
              </Select>
            </Field>
            <Field label="2. 開業日">
              <TriSelect value={draft.openingDate} onChange={(v) => set("openingDate", v)} yes="設定している" no="設定していない" />
            </Field>
          </div>
          {draft.descState === "set" && (
            <Field label="説明文の本文" hint={`${draft.description.length} / ${DESCRIPTION_MAX} 文字。200 文字以上、URL なし、対策キーワード入りが目安`}>
              <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} rows={4} maxLength={DESCRIPTION_MAX} />
            </Field>
          )}

          <div className="grid gap-4 @md:grid-cols-2">
            <Field label="3. メニュー・サービス">
              <TriSelect value={draft.menu} onChange={(v) => set("menu", v)} yes="設定している" no="設定していない" />
            </Field>
            <Field label="4. 直近 4 週間の投稿数" hint="週 1 件以上（4 件以上）が目安">
              <Input type="number" inputMode="numeric" min={0} max={999} value={draft.posts} onChange={(e) => set("posts", e.target.value)} placeholder="例: 4" />
            </Field>
          </div>
          <Field
            label="5. 最新の投稿の本文"
            hint={posts === 0 ? "投稿が 0 件なので不要です" : "対策キーワードが入っているかを判定します。空欄なら未回答"}
          >
            <Textarea
              value={draft.latestPostText}
              onChange={(e) => set("latestPostText", e.target.value)}
              rows={3}
              maxLength={MAX_POST_TEXT}
              disabled={posts === 0}
            />
          </Field>

          <div className="grid gap-4 @md:grid-cols-3">
            <Field label="6. オーナーが最後に写真を追加した日" hint="1 か月以内が目安">
              <Input type="date" value={draft.ownerPhotoLastAt} onChange={(e) => set("ownerPhotoLastAt", e.target.value)} />
            </Field>
            <Field label="7. ロゴ">
              <TriSelect value={draft.logo} onChange={(v) => set("logo", v)} yes="設定している" no="設定していない" />
            </Field>
            <Field label="7. カバー写真">
              <TriSelect value={draft.cover} onChange={(v) => set("cover", v)} yes="設定している" no="設定していない" />
            </Field>
          </div>

          <div className="grid gap-4 @md:grid-cols-2">
            <Field
              label="8. 返信済みの口コミ件数"
              hint={ratingCount === null ? "返信率 = 返信済み ÷ Google 上の口コミ件数" : `Google 上の口コミは ${ratingCount} 件。90% 以上が目安`}
            >
              <Input type="number" inputMode="numeric" min={0} max={100000} value={draft.replied} onChange={(e) => set("replied", e.target.value)} placeholder="例: 95" />
            </Field>
          </div>
          <Field
            label="9. 代表的な返信文（最近の 1 件）"
            hint={replied === 0 ? "返信が 0 件なので不要です" : "店舗名や対策キーワードが入っているかを判定します。空欄なら未回答"}
          >
            <Textarea
              value={draft.replyText}
              onChange={(e) => set("replyText", e.target.value)}
              rows={3}
              maxLength={MAX_REPLY_TEXT}
              disabled={replied === 0}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy === "save"} disabled={busy !== null}>
              保存して採点し直す
            </Button>
            {saved && (
              <Button type="button" variant="ghost" size="sm" onClick={() => void onDelete()} loading={busy === "delete"} disabled={busy !== null}>
                入力を消す
              </Button>
            )}
            <span className="text-[12px] text-muted">
              キーワードは {MAX_KEYWORDS} つまで。数字の根拠は Google ビジネス プロフィールの管理画面（https://business.google.com/）で確認できます。
            </span>
          </div>
        </form>
      )}
    </Card>
  );
}
