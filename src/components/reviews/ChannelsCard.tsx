"use client";

/**
 * QR コードの発行（店舗別・テーブル別・スタッフ別など）。
 * 画像はサーバーが描く（/api/reviews/forms/[id]/qr）。SVG は印刷、PNG は SNS・チラシ用。
 */
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import type { ReviewChannel, ReviewForm } from "@/lib/reviews/forms";
import { CHANNEL_LABEL_MAX, MAX_CHANNELS } from "@/lib/reviews/questions";
import { surveyPath } from "@/lib/reviews/url";

export interface ChannelsCardProps {
  number: number;
  form: ReviewForm;
  channels: ReviewChannel[];
  onAdd: (label: string) => Promise<void>;
  onRemove: (channelId: string) => Promise<void>;
}

export function ChannelsCard({ number, form, channels, onAdd, onRemove }: ChannelsCardProps) {
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function add(e: FormEvent) {
    e.preventDefault();
    const l = label.trim();
    if (!l) {
      setError("ラベルを入力してください（例: テーブル 3、レジ、スタッフ A）");
      return;
    }
    setError(null);
    setBusy("add");
    try {
      await onAdd(l);
      setLabel("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "発行に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
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

  return (
    <Card
      number={number}
      title="QR コード"
      description="店舗別・テーブル別・スタッフ別など、置き場所ごとに発行すると、どこから回答が来たかを見られます。QR の中身は来店客向けアンケートの URL です。"
    >
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <Field label="ラベル（置き場所や担当）" htmlFor="channel-label" className="min-w-0 flex-1">
          <Input id="channel-label" maxLength={CHANNEL_LABEL_MAX} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: テーブル 3 / レジ横 / スタッフ A" />
        </Field>
        <Button type="submit" loading={busy === "add"} disabled={busy !== null || channels.length >= MAX_CHANNELS}>
          発行する
        </Button>
      </form>
      {error && (
        <Callout tone="fail" className="mt-3">
          {error}
        </Callout>
      )}
      {channels.length === 0 ? (
        <EmptyState className="mt-4" title="QR コードはまだありません" description="ラベルを付けて発行してください。" />
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {channels.map((c) => {
            const path = surveyPath(form.slug, c.code);
            const url = `${origin}${path}`;
            const img = `/api/reviews/forms/${form.id}/qr?c=${c.code}`;
            return (
              <li key={c.id} className="flex gap-3 rounded-sm border border-line bg-surface p-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- サーバーが動的に描く SVG。next/image の最適化対象ではない */}
                <img src={img} alt={`${c.label} の QR コード`} width={96} height={96} className="h-24 w-24 shrink-0 rounded-sm border border-line bg-panel" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{c.label}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted" title={url}>
                    {url}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <ButtonLink href={img} external size="sm">
                      SVG
                    </ButtonLink>
                    <ButtonLink href={`${img}&format=png`} external size="sm">
                      PNG
                    </ButtonLink>
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
        QR を消しても、その QR から届いた回答は残ります（経路が「QR なし」になります）。印刷は SVG を推奨（拡大しても荒れません）。
      </p>
    </Card>
  );
}
