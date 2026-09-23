"use client";

/**
 * トップバーの「ご意見・不具合」ボタンと、押すと開く送信フォーム（モーダル）。
 *
 * 利用者の指示（2026-09-20）: 各ユーザーから運営者へ困りごと・バグ・要望を集めやすくする。
 * どの画面からでも同じ場所（トップバー右）から送れるようにし、開いていた画面のパスを自動で付ける。
 * 送ったあとの返答は設定画面の「ご意見の履歴」に出る。
 *
 * ClerkProvider に依存しない（fetch だけ）。未ログインなら API が 401 を返すので、その旨を出す。
 */
import { usePathname } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { FEEDBACK_BODY_MAX, FEEDBACK_KIND_LABELS, FEEDBACK_KINDS, type FeedbackKind, type FeedbackRecord } from "@/lib/feedback/types";

export function FeedbackDialog() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const openerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="ご意見・不具合の報告"
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-[13px] font-bold text-accent outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <FeedbackIcon className="h-4 w-4" />
        <span className="hidden sm:inline">ご意見・不具合</span>
        <span className="sr-only sm:hidden">ご意見・不具合の報告</span>
      </button>
      {open && (
        <FeedbackForm
          path={pathname}
          onClose={() => {
            setOpen(false);
            openerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function FeedbackIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H8l-5 3 1.5-4.5A8 8 0 1 1 21 12Z" />
      <path d="M8 10h8M8 14h5" />
    </svg>
  );
}

interface FormProps {
  path: string;
  onClose: () => void;
}

function FeedbackForm({ path, onClose }: FormProps) {
  const titleId = useId();
  const kindId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<FeedbackRecord | null>(null);

  // 開いている間: Escape で閉じる・body のスクロールを止める・最初の入力欄へフォーカス・Tab でモーダルの外に出ない
  const trapFocus = useFocusTrap(panelRef, { active: true, onClose, initialFocus: "select, textarea" });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const text = body.trim();
    if (!text) {
      setError("内容を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, body: text, path }),
      });
      const data = (await res.json().catch(() => null)) as { item?: FeedbackRecord; error?: string } | null;
      if (res.status === 401) throw new Error("ログインしてからお送りください。");
      if (!res.ok || !data?.item) throw new Error(data?.error ?? `送信できませんでした（HTTP ${res.status}）`);
      setSent(data.item);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="no-print fixed inset-0 z-40 bg-ink/50" onClick={onClose} aria-hidden />
      <div className="no-print fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" onKeyDown={trapFocus}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="max-h-[92vh] w-full overflow-y-auto rounded-t-md border border-line bg-panel p-5 shadow-none sm:max-w-lg sm:rounded-sm md:p-6"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="flex items-center gap-3 text-lg font-bold text-ink">
                <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden />
                ご意見・不具合の報告
              </h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                困りごと・不具合・「こうしてほしい」を運営者に直接お送りいただけます。返答は設定画面の「ご意見の履歴」に出ます。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="-mr-2 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {sent ? (
            <div>
              <Callout tone="pass" title="送信しました。ありがとうございます。">
                内容を確認して対応します。返答は設定画面の「ご意見の履歴」でご覧いただけます。
              </Callout>
              <div className="mt-4 flex justify-end">
                <Button onClick={onClose}>閉じる</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="種類" htmlFor={kindId} required>
                <Select id={kindId} value={kind} onChange={(e) => setKind(e.target.value as FeedbackKind)}>
                  {FEEDBACK_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {FEEDBACK_KIND_LABELS[k]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="内容"
                htmlFor={bodyId}
                required
                error={error}
                hint={
                  kind === "bug"
                    ? "何をしたときに、何が起きたか（出たメッセージ、期待していた動き）を書いていただけると早く直せます"
                    : "できるだけ具体的にお書きください"
                }
              >
                <Textarea
                  id={bodyId}
                  rows={6}
                  maxLength={FEEDBACK_BODY_MAX}
                  value={body}
                  invalid={Boolean(error)}
                  placeholder={kind === "bug" ? "例: 順位計測で「計測する」を押すと、何も出ずに止まります。" : "例: 競合の順位も一緒にグラフで見たいです。"}
                  onChange={(e) => {
                    setBody(e.target.value);
                    if (error) setError(null);
                  }}
                />
              </Field>
              <p className="text-[12px] text-muted">
                開いていた画面（<span className="font-mono">{path}</span>）・お使いのブラウザ・ご契約プラン・アプリの版は自動で添えられます。個人情報やパスワードは書かないでください。
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" onClick={onClose} disabled={busy}>
                  キャンセル
                </Button>
                <Button type="submit" loading={busy}>
                  送信する
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
