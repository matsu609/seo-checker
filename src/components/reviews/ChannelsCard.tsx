"use client";

/**
 * QR コードの発行。
 *
 * - 店舗ごと: 店舗（MEO の登録店舗から選ぶか、店名と Place ID を手入力）を紐づけて発行する。
 *   その QR から開いた来店客の画面はその店舗名になり、投稿ボタンはその店舗の Google マップに飛ぶ。
 *   MEO に登録済みの自社店舗が複数あれば「まとめて発行」で 1 店舗 1 枚を一度に作れる。
 * - 置き場所ごと: 店舗を紐づけずラベルだけ（テーブル 3、レジ横 など）。本体の店舗として扱う。
 *
 * 画像はサーバーが描く（/api/reviews/forms/[id]/qr）。SVG は印刷、PNG はチラシ・SNS 用。
 */
import { useState, type FormEvent } from "react";
import type { ReviewsStoreOption } from "@/app/api/reviews/forms/route";
import { Button, buttonClass } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select } from "@/components/ui/Field";
import { channelDisplayName, type ReviewChannel, type ReviewForm } from "@/lib/reviews/forms";
import { CHANNEL_LABEL_MAX, MAX_CHANNELS, STORE_NAME_MAX } from "@/lib/reviews/questions";
import { surveyPath } from "@/lib/reviews/url";

export interface NewChannelInput {
  label?: string;
  storeName?: string;
  placeId?: string;
  writeReviewUrl?: string;
}

export interface ChannelsCardProps {
  number: number;
  form: ReviewForm;
  channels: ReviewChannel[];
  /** MEO に登録済みの自社店舗（無ければ []） */
  stores: ReviewsStoreOption[];
  onAdd: (input: NewChannelInput) => Promise<void>;
  onBulkFromStores: () => Promise<void>;
  onRemove: (channelId: string) => Promise<void>;
}

type Mode = "store" | "place";
/** 店舗の選び方: 登録店舗から / 手入力 */
type StoreSource = string; // placeId、または "" = 手入力

export function ChannelsCard({ number, form, channels, stores, onAdd, onBulkFromStores, onRemove }: ChannelsCardProps) {
  const [mode, setMode] = useState<Mode>("store");
  const [source, setSource] = useState<StoreSource>(stores[0]?.placeId ?? "");
  const [storeName, setStoreName] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const linkedPlaceIds = new Set(channels.map((c) => c.placeId).filter((p): p is string => p !== null));
  const unlinkedStores = stores.filter((s) => !linkedPlaceIds.has(s.placeId));
  const full = channels.length >= MAX_CHANNELS;

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input: NewChannelInput = {};
    if (mode === "store") {
      const picked = source ? stores.find((s) => s.placeId === source) : null;
      const name = picked ? picked.name : storeName.trim();
      if (!name) {
        setError("店舗を選ぶか、店名を入力してください。");
        return;
      }
      input.storeName = name;
      const pid = picked ? picked.placeId : placeId.trim();
      if (pid) input.placeId = pid;
      if (label.trim()) input.label = label.trim();
    } else {
      if (!label.trim()) {
        setError("ラベルを入力してください（例: テーブル 3、レジ横）。");
        return;
      }
      input.label = label.trim();
    }
    setBusy("add");
    try {
      await onAdd(input);
      setLabel("");
      setStoreName("");
      setPlaceId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "発行に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function bulk() {
    setError(null);
    setBusy("bulk");
    try {
      await onBulkFromStores();
    } catch (err) {
      setError(err instanceof Error ? err.message : "発行に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    const target = channels.find((c) => c.id === id);
    if (!window.confirm(`QR コード「${target ? channelDisplayName(target) : ""}」を削除します。印刷済みの QR は読めなくなります（届いた回答は残ります）。よろしいですか？`)) return;
    setBusy(id);
    setError(null);
    try {
      await onRemove(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function copy(url: string, id: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      setError("コピーできませんでした。URL を選択してコピーしてください。");
    }
  }

  const manual = mode === "store" && (stores.length === 0 || source === "");

  return (
    <Card
      number={number}
      title="QR コード"
      description="このアンケートに紐づく QR コードを、店舗ごと・置き場所ごとに発行します。店舗を紐づけた QR から開くと、来店客の画面はその店舗名になり、投稿ボタンはその店舗の Google マップに飛びます。回答は QR ごとに集計されます。"
      actions={
        unlinkedStores.length > 0 && !full ? (
          <Button type="button" size="sm" variant="secondary" onClick={bulk} loading={busy === "bulk"} disabled={busy !== null}>
            登録済みの自社店舗 {unlinkedStores.length} 件にまとめて発行
          </Button>
        ) : null
      }
    >
      <form onSubmit={add} className="rounded-sm border border-line bg-surface p-3">
        <div role="radiogroup" aria-label="発行の種類" className="flex flex-wrap gap-4 text-[13px] text-ink">
          <label className="flex items-center gap-2">
            <input type="radio" name="channel-mode" checked={mode === "store"} onChange={() => setMode("store")} className="h-4 w-4 accent-accent" />
            店舗ごと（店舗を紐づける）
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="channel-mode" checked={mode === "place"} onChange={() => setMode("place")} className="h-4 w-4 accent-accent" />
            置き場所ごと（本体の店舗のまま）
          </label>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {mode === "store" && stores.length > 0 && (
            <Field label="店舗" htmlFor="channel-store" hint="MEO に登録した自社店舗。無い店舗は「手入力」">
              <Select id="channel-store" value={source} onChange={(e) => setSource(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.placeId} value={s.placeId}>
                    {s.name}
                    {linkedPlaceIds.has(s.placeId) ? "（発行済み）" : ""}
                  </option>
                ))}
                <option value="">手入力</option>
              </Select>
            </Field>
          )}
          {manual && (
            <>
              <Field label="店名" htmlFor="channel-store-name">
                <Input id="channel-store-name" maxLength={STORE_NAME_MAX} value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="例: 〇〇食堂 駅前店" />
              </Field>
              <Field label="Google マップの Place ID（任意）" htmlFor="channel-place" hint="無いと投稿ボタンは本体の店舗の投稿先になります">
                <Input id="channel-place" value={placeId} onChange={(e) => setPlaceId(e.target.value)} placeholder="ChIJ…" />
              </Field>
            </>
          )}
          <Field
            label={mode === "store" ? "ラベル（任意。置き場所や担当）" : "ラベル（置き場所や担当）"}
            htmlFor="channel-label"
            hint={mode === "store" ? "空なら店名がラベルになります" : undefined}
          >
            <Input id="channel-label" maxLength={CHANNEL_LABEL_MAX} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: テーブル 3 / レジ横 / スタッフ A" />
          </Field>
        </div>
        <div className="mt-3">
          <Button type="submit" loading={busy === "add"} disabled={busy !== null || full}>
            発行する
          </Button>
          {full && <span className="ml-3 text-[12px] text-muted">1 つのアンケートにつき {MAX_CHANNELS} 件までです。</span>}
        </div>
      </form>
      {error && (
        <Callout tone="fail" className="mt-3">
          {error}
        </Callout>
      )}
      {channels.length === 0 ? (
        <EmptyState className="mt-4" title="QR コードはまだありません" description="店舗を選んで発行してください。" />
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {channels.map((c) => {
            const path = surveyPath(form.slug, c.code);
            const url = `${origin}${path}`;
            const img = `/api/reviews/forms/${form.id}/qr?c=${c.code}`;
            return (
              <li key={c.id} className="flex gap-3 rounded-sm border border-line bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- サーバーが動的に描く SVG。next/image の最適化対象ではない */}
                <img src={img} alt={`${channelDisplayName(c)} の QR コード`} width={96} height={96} className="h-24 w-24 shrink-0 rounded-sm border border-line bg-panel" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{channelDisplayName(c)}</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {c.storeName ? (c.writeReviewUrl ? "投稿先: この店舗の Google マップ" : "投稿先: 本体の店舗（Place ID 未設定）") : `店舗: ${form.storeName}（本体）`}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted" title={url}>
                    {url}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <a href={`${img}&download=1`} download className={buttonClass("secondary", "sm")}>
                      SVG を保存
                    </a>
                    <a href={`${img}&format=png&download=1`} download className={buttonClass("secondary", "sm")}>
                      PNG を保存
                    </a>
                    <Button type="button" size="sm" variant="secondary" onClick={() => copy(url, c.id)}>
                      {copied === c.id ? "コピーしました" : "URL をコピー"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => remove(c.id)} loading={busy === c.id} disabled={busy !== null}>
                      削除
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        「SVG を保存」「PNG を保存」でファイルがダウンロードされます（印刷は SVG を推奨。拡大しても荒れません。PNG は 1024px）。QR を消しても、その QR から届いた回答は残ります（経路が「QR なし」になります）。
      </p>
    </Card>
  );
}
