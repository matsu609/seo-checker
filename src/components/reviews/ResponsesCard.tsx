"use client";

/**
 * 回答の一覧。低評価・「お店に直接伝える」を先頭に並べる既定の並びと、期間・経路・対応状態の絞り込み。
 * 行を開くと、回答の全文・AI 下書き・投稿時の本文・直接連絡の本文と、対応状態・メモを編集できる。
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { ReviewChannel, ReviewForm } from "@/lib/reviews/forms";
import { answerLines, NOTE_MAX } from "@/lib/reviews/questions";
import { RESPONSE_STATUS_LABELS, RESPONSE_STATUSES, type ResponseStatus, type ReviewResponse } from "@/lib/reviews/responses";
import { formatDateTime } from "@/lib/report/format";

export interface ResponsesFilter {
  status: "" | ResponseStatus;
  lowOnly: boolean;
  channelId: string;
  from: string;
  to: string;
}

export const EMPTY_FILTER: ResponsesFilter = { status: "", lowOnly: false, channelId: "", from: "", to: "" };

export interface ResponsesCardProps {
  number: number;
  form: ReviewForm;
  channels: ReviewChannel[];
  responses: ReviewResponse[];
  loading: boolean;
  error: string | null;
  filter: ResponsesFilter;
  onFilterChange: (filter: ResponsesFilter) => void;
  onUpdate: (id: string, patch: { status?: ResponseStatus; note?: string | null }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type Order = "priority" | "newest" | "rating";

/** 低評価・直接連絡・未対応を先頭に、その中は新しい順 */
export function priorityOf(r: ReviewResponse): number {
  let p = 0;
  if (r.directMessage) p += 4;
  if (r.isLow) p += 2;
  if (r.status === "open") p += 1;
  return p;
}

export function sortResponses(list: readonly ReviewResponse[], order: Order): ReviewResponse[] {
  const byNewest = (a: ReviewResponse, b: ReviewResponse) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);
  const copy = [...list];
  if (order === "newest") return copy.sort(byNewest);
  if (order === "rating") return copy.sort((a, b) => (a.rating ?? 9) - (b.rating ?? 9) || byNewest(a, b));
  return copy.sort((a, b) => priorityOf(b) - priorityOf(a) || byNewest(a, b));
}

function ratingBadge(r: ReviewResponse) {
  if (r.rating === null) return <span className="text-muted">–</span>;
  const tone = r.isLow ? "fail" : r.rating >= 4 ? "pass" : "warn";
  return <Badge tone={tone}>{r.rating} / 5</Badge>;
}

export function ResponsesCard({ number, form, channels, responses, loading, error, filter, onFilterChange, onUpdate, onDelete }: ResponsesCardProps) {
  const [order, setOrder] = useState<Order>("priority");
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = useMemo(() => sortResponses(responses, order), [responses, order]);
  const labelOf = useMemo(() => new Map(channels.map((c) => [c.id, c.label])), [channels]);
  const csvParams = new URLSearchParams({ formId: form.id, format: "csv" });
  if (filter.status) csvParams.set("status", filter.status);
  if (filter.lowOnly) csvParams.set("low", "1");
  if (filter.channelId) csvParams.set("channel", filter.channelId);
  if (filter.from) csvParams.set("from", filter.from);
  if (filter.to) csvParams.set("to", filter.to);

  return (
    <Card
      number={number}
      title="回答一覧"
      description="誰がどう答え、どんな下書きが作られたかを時系列で確認します。低評価と「お店に直接伝える」は先頭に並びます。対応したら状態とメモを残してください。"
      actions={
        <ButtonLink href={`/api/reviews/responses?${csvParams.toString()}`} external size="sm">
          CSV
        </ButtonLink>
      }
    >
      <div className="grid gap-3 md:grid-cols-6">
        <Field label="並び" htmlFor="resp-order">
          <Select id="resp-order" value={order} onChange={(e) => setOrder(e.target.value as Order)}>
            <option value="priority">低評価・直接連絡を先に</option>
            <option value="newest">新しい順</option>
            <option value="rating">評価が低い順</option>
          </Select>
        </Field>
        <Field label="対応状態" htmlFor="resp-status">
          <Select id="resp-status" value={filter.status} onChange={(e) => onFilterChange({ ...filter, status: e.target.value as ResponsesFilter["status"] })}>
            <option value="">すべて</option>
            {RESPONSE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {RESPONSE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="経路（QR）" htmlFor="resp-channel">
          <Select id="resp-channel" value={filter.channelId} onChange={(e) => onFilterChange({ ...filter, channelId: e.target.value })}>
            <option value="">すべて</option>
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="開始日" htmlFor="resp-from">
          <Input id="resp-from" type="date" value={filter.from} onChange={(e) => onFilterChange({ ...filter, from: e.target.value })} />
        </Field>
        <Field label="終了日" htmlFor="resp-to">
          <Input id="resp-to" type="date" value={filter.to} onChange={(e) => onFilterChange({ ...filter, to: e.target.value })} />
        </Field>
        <div className="flex items-end pb-3">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={filter.lowOnly} onChange={(e) => onFilterChange({ ...filter, lowOnly: e.target.checked })} className="h-4 w-4 accent-accent" />
            低評価だけ
          </label>
        </div>
      </div>

      {error && (
        <Callout tone="fail" className="mt-3">
          {error}
        </Callout>
      )}
      {loading && responses.length === 0 ? (
        <p className="mt-4 text-[13px] text-muted">読み込んでいます…</p>
      ) : sorted.length === 0 ? (
        <EmptyState className="mt-4" title="回答はまだありません" description="QR コードを店内に置くと、来店客の回答がここに届きます。" />
      ) : (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {sorted.map((r) => {
            const open = openId === r.id;
            const textPreview = answerLines(form.questions, r.answers).find((l) => form.questions.find((q) => q.label === l.label)?.type === "text")?.value ?? "";
            return (
              <li key={r.id} className={r.isLow || r.directMessage ? "bg-fail-soft/30" : ""}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  aria-expanded={open}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-2 py-2.5 text-left text-[13px] outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="w-36 shrink-0 tabular-nums text-muted">{formatDateTime(r.createdAt)}</span>
                  <span className="w-16 shrink-0">{ratingBadge(r)}</span>
                  <span className="w-28 shrink-0 truncate text-muted">{r.channelId ? (labelOf.get(r.channelId) ?? "QR なし") : "QR なし"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink">{textPreview || <span className="text-muted">（自由記述なし）</span>}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.directMessage && <Badge tone="fail">直接連絡</Badge>}
                    {r.clickedReviewAt && <Badge tone="info">投稿ボタン</Badge>}
                    <Badge tone={r.status === "done" ? "pass" : r.status === "in_progress" ? "warn" : "neutral"}>{RESPONSE_STATUS_LABELS[r.status]}</Badge>
                  </span>
                </button>
                {open && <ResponseDetail form={form} response={r} onUpdate={onUpdate} onDelete={onDelete} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ResponseDetail({
  form,
  response,
  onUpdate,
  onDelete,
}: {
  form: ReviewForm;
  response: ReviewResponse;
  onUpdate: ResponsesCardProps["onUpdate"];
  onDelete: ResponsesCardProps["onDelete"];
}) {
  const [note, setNote] = useState(response.note ?? "");
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function changeStatus(status: ResponseStatus) {
    setError(null);
    try {
      await onUpdate(response.id, { status });
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新に失敗しました");
    }
  }

  async function saveNote() {
    setBusy("save");
    setError(null);
    try {
      await onUpdate(response.id, { note: note.trim() || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    setError(null);
    try {
      await onDelete(response.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-4 px-2 pb-4 pt-1 md:grid-cols-2">
      <div className="space-y-3">
        <h4 className="text-[12px] font-bold text-muted">回答</h4>
        <dl className="space-y-2 text-[13px]">
          {answerLines(form.questions, response.answers).map((l) => (
            <div key={l.label}>
              <dt className="text-muted">{l.label}</dt>
              <dd className="whitespace-pre-wrap text-ink">{l.value}</dd>
            </div>
          ))}
        </dl>
        {response.directMessage && (
          <div className="rounded-sm border border-fail bg-fail-soft p-3 text-[13px]">
            <p className="font-bold text-fail">お店に直接伝える（{response.clickedDirectAt ? formatDateTime(response.clickedDirectAt) : ""}）</p>
            <p className="mt-1 whitespace-pre-wrap text-ink">{response.directMessage}</p>
            {response.directContact && <p className="mt-1 text-muted">連絡先: {response.directContact}</p>}
          </div>
        )}
      </div>
      <div className="space-y-3">
        <h4 className="text-[12px] font-bold text-muted">
          口コミの下書き{response.draftSource === "ai" ? "（AI）" : response.draftSource === "fallback" ? "（回答をそのまま）" : ""}
        </h4>
        <p className="whitespace-pre-wrap rounded-sm border border-line bg-surface p-3 text-[13px] text-ink">{response.draft ?? "（下書きなし）"}</p>
        {response.clickedReviewAt && (
          <>
            <h4 className="text-[12px] font-bold text-muted">投稿ボタンを押した時点の本文（{formatDateTime(response.clickedReviewAt)}）</h4>
            <p className="whitespace-pre-wrap rounded-sm border border-line bg-surface p-3 text-[13px] text-ink">{response.draftFinal ?? "（本文なし）"}</p>
          </>
        )}
        <div className="grid gap-3 md:grid-cols-[10rem_1fr]">
          <Field label="対応状態" htmlFor={`status-${response.id}`}>
            <Select id={`status-${response.id}`} value={response.status} onChange={(e) => changeStatus(e.target.value as ResponseStatus)}>
              {RESPONSE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {RESPONSE_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="対応メモ" htmlFor={`note-${response.id}`} hint={response.handledAt ? `最終対応: ${formatDateTime(response.handledAt)}` : undefined}>
            <Textarea id={`note-${response.id}`} rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        {error && <Callout tone="fail">{error}</Callout>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" size="sm" onClick={saveNote} loading={busy === "save"} disabled={busy !== null}>
            メモを保存
          </Button>
          {confirm ? (
            <span className="flex items-center gap-2 text-[12px] text-muted">
              この回答を消します。
              <Button type="button" size="sm" variant="danger" onClick={remove} loading={busy === "delete"} disabled={busy !== null}>
                削除する
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                やめる
              </Button>
            </span>
          ) : (
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(true)} disabled={busy !== null}>
              削除
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
