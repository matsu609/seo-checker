"use client";

/**
 * 設定画面の「ご意見の履歴」カード。自分が送ったご意見・不具合の報告と、運営者の返答を出す。
 * メールを送る仕組みを持たないので、返答はここで読んでもらう（送信フォームの文言と対応）。
 */
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FEEDBACK_KIND_LABELS, FEEDBACK_STATUS_LABELS, type FeedbackRecord, type FeedbackStatus } from "@/lib/feedback/types";

/** 各所から直接飛ぶためのカード id（/settings#feedback） */
export const FEEDBACK_ANCHOR = "feedback";

const STATUS_TONE: Record<FeedbackStatus, "warn" | "info" | "pass"> = { open: "warn", in_progress: "info", done: "pass" };

export function formatFeedbackDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

type State = { status: "loading" } | { status: "ready"; items: FeedbackRecord[] } | { status: "error"; message: string } | { status: "unavailable" };

export function FeedbackHistoryCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/feedback", { cache: "no-store" });
        if (!alive) return;
        // 保存先（Supabase）が未設定の環境ではカードの中身だけ控えめに出す
        if (res.status === 503) return setState({ status: "unavailable" });
        if (res.status === 401) return setState({ status: "error", message: "ログインすると、送ったご意見と返答をここで確認できます。" });
        const data = (await res.json().catch(() => null)) as { items?: FeedbackRecord[]; error?: string } | null;
        if (!res.ok || !data?.items) throw new Error(data?.error ?? `HTTP ${res.status}`);
        setState({ status: "ready", items: data.items });
      } catch (err) {
        if (alive) setState({ status: "error", message: err instanceof Error ? err.message : "読み込めませんでした" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  return (
    <Card
      id={FEEDBACK_ANCHOR}
      title="ご意見の履歴"
      description="画面右上の「ご意見・不具合」から送った内容と、運営者からの返答です。返答が付くとここに出ます（メールは送りません）。"
      actions={
        <Button size="sm" variant="secondary" onClick={() => setReloadKey((k) => k + 1)} disabled={state.status === "loading"}>
          更新
        </Button>
      }
    >
      {state.status === "loading" && <p className="text-[13px] text-muted">読み込み中…</p>}
      {state.status === "unavailable" && <p className="text-[13px] text-muted">この環境では保存先（Supabase）が未設定のため、履歴は表示できません。</p>}
      {state.status === "error" && <Callout tone="info">{state.message}</Callout>}
      {state.status === "ready" &&
        (state.items.length === 0 ? (
          <EmptyState title="まだ送ったご意見はありません" description="困りごとや不具合、「こうしてほしい」があれば、画面右上の「ご意見・不具合」からお送りください。" />
        ) : (
          <ul className="divide-y divide-line">
            {state.items.map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
                  <Badge tone={STATUS_TONE[item.status]} icon={false}>
                    {FEEDBACK_STATUS_LABELS[item.status]}
                  </Badge>
                  <span className="font-bold text-ink">{FEEDBACK_KIND_LABELS[item.kind]}</span>
                  <span className="tabular-nums">{formatFeedbackDate(item.createdAt)}</span>
                  {item.path && <span className="font-mono">{item.path}</span>}
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{item.body}</p>
                {item.reply && (
                  <div className="mt-2 rounded-sm border border-line bg-surface p-3 text-[13px] leading-relaxed">
                    <p className="text-[11px] text-muted">
                      運営者からの返答{item.repliedAt && <span className="ml-1.5 tabular-nums">{formatFeedbackDate(item.repliedAt)}</span>}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-ink">{item.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}
    </Card>
  );
}
