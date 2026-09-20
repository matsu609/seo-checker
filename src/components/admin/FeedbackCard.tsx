"use client";

/**
 * マスター画面の「お客様からのご意見・不具合」カード。
 *
 * 全員分を新しい順に出し、状態（未対応 / 対応中 / 対応済み）と返答をその場で書ける。
 * 返答はお客様の設定画面の「ご意見の履歴」に出る（メールは送らない。送るなら送信サービスの契約が要る）。
 * 誰が・どの画面で・どの版で・どのブラウザで、が自動で付いているので、不具合の再現はここから始める。
 */
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, Textarea } from "@/components/ui/Field";
import { formatFeedbackDate } from "@/components/feedback/FeedbackHistoryCard";
import {
  compareFeedback,
  describeUserAgent,
  FEEDBACK_KIND_LABELS,
  FEEDBACK_REPLY_MAX,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  type FeedbackRecord,
  type FeedbackStatus,
} from "@/lib/feedback/types";
import { planShortLabel, toPlanId } from "@/lib/plans/catalog";

export interface FeedbackCardProps {
  /** サーバーで読んだ初期値。読めなかったときは null（理由は loadError） */
  initial: FeedbackRecord[] | null;
  loadError?: string | null;
}

const STATUS_TONE: Record<FeedbackStatus, "warn" | "info" | "pass"> = { open: "warn", in_progress: "info", done: "pass" };
type Filter = FeedbackStatus | "all";

export function FeedbackCard({ initial, loadError = null }: FeedbackCardProps) {
  const [items, setItems] = useState<FeedbackRecord[]>(initial ?? []);
  const [filter, setFilter] = useState<Filter>("open");
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<FeedbackStatus, number> = { open: 0, in_progress: 0, done: 0 };
    for (const i of items) c[i.status] += 1;
    return c;
  }, [items]);
  const visible = useMemo(() => [...items].filter((i) => filter === "all" || i.status === filter).sort(compareFeedback), [items, filter]);

  async function patch(id: string, body: { status?: FeedbackStatus; reply?: string | null }): Promise<boolean> {
    setError(null);
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...body }),
      });
      const data = (await res.json().catch(() => null)) as { item?: FeedbackRecord; error?: string } | null;
      if (!res.ok || !data?.item) throw new Error(data?.error ?? `HTTP ${res.status}`);
      const updated = data.item;
      setItems((prev) => prev.map((i) => (i.id === id ? updated : i)));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新できませんでした");
      return false;
    }
  }

  return (
    <Card
      title="お客様からのご意見・不具合"
      description="ツールの右上「ご意見・不具合」から届いたものです。状態を変え、返答を書くとお客様の設定画面「ご意見の履歴」に出ます（メールは送りません）。"
      actions={
        <Select aria-label="表示する状態" className="h-9 w-auto text-[13px]" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="open">未対応（{counts.open}）</option>
          <option value="in_progress">対応中（{counts.in_progress}）</option>
          <option value="done">対応済み（{counts.done}）</option>
          <option value="all">すべて（{items.length}）</option>
        </Select>
      }
    >
      {loadError && (
        <Callout tone="warn" className="mb-4">
          {loadError}
        </Callout>
      )}
      {error && (
        <Callout tone="fail" className="mb-4">
          {error}
        </Callout>
      )}
      {!loadError && visible.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "まだご意見は届いていません" : `${filter === "open" ? "未対応" : FEEDBACK_STATUS_LABELS[filter]}のものはありません`}
          description="お客様がツールの右上「ご意見・不具合」から送ると、ここに並びます。"
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((item) => (
            <FeedbackRow key={item.id} item={item} onPatch={patch} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function FeedbackRow({ item, onPatch }: { item: FeedbackRecord; onPatch: (id: string, body: { status?: FeedbackStatus; reply?: string | null }) => Promise<boolean> }) {
  const [reply, setReply] = useState(item.reply ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const planId = toPlanId(item.plan);

  async function saveReply() {
    setBusy(true);
    const ok = await onPatch(item.id, { reply: reply.trim() || null, ...(item.status === "open" && reply.trim() ? { status: "in_progress" as const } : {}) });
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
        <Badge tone={STATUS_TONE[item.status]} icon={false}>
          {FEEDBACK_STATUS_LABELS[item.status]}
        </Badge>
        <span className="font-bold text-ink">{FEEDBACK_KIND_LABELS[item.kind]}</span>
        <span className="tabular-nums">{formatFeedbackDate(item.createdAt)}</span>
        <span className="text-ink">{item.name || "（名前なし）"}</span>
        {item.email && <span>{item.email}</span>}
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{item.body}</p>
      <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
        <div>
          <dt className="inline">画面: </dt>
          <dd className="inline font-mono">{item.path || "—"}</dd>
        </div>
        <div>
          <dt className="inline">プラン: </dt>
          <dd className="inline">{planId ? planShortLabel(planId) : item.plan || "—"}</dd>
        </div>
        <div>
          <dt className="inline">ブラウザ: </dt>
          <dd className="inline" title={item.userAgent}>
            {describeUserAgent(item.userAgent) || "—"}
          </dd>
        </div>
        <div>
          <dt className="inline">版: </dt>
          <dd className="inline font-mono">
            {item.release > 0 ? `r${item.release}` : "—"}
            {item.commit && <span className="ml-1">{item.commit}</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-start gap-2">
        <Select
          aria-label="対応状態"
          className="h-9 w-auto text-[13px]"
          value={item.status}
          disabled={busy}
          onChange={async (e) => {
            setBusy(true);
            await onPatch(item.id, { status: e.target.value as FeedbackStatus });
            setBusy(false);
          }}
        >
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {FEEDBACK_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        {!editing && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
            {item.reply ? "返答を編集" : "返答を書く"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <Textarea
            aria-label="お客様への返答"
            rows={4}
            maxLength={FEEDBACK_REPLY_MAX}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="例: ご報告ありがとうございます。順位計測の不具合は r128 で修正しました。お手数ですが画面を開き直してお試しください。"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" onClick={saveReply} loading={busy}>
              返答を保存
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setReply(item.reply ?? "");
                setEditing(false);
              }}
            >
              キャンセル
            </Button>
          </div>
        </div>
      ) : (
        item.reply && (
          <div className="mt-2 rounded-sm border border-line bg-surface p-3 text-[13px] leading-relaxed">
            <p className="text-[11px] text-muted">
              返答{item.repliedAt && <span className="ml-1.5 tabular-nums">{formatFeedbackDate(item.repliedAt)}</span>}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-ink">{item.reply}</p>
          </div>
        )
      )}
    </li>
  );
}
