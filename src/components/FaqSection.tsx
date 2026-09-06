"use client";

import { useCallback, useMemo, useState } from "react";
import type { AnalysisResult } from "@/lib/analyzer/types";
import type { EditableFaq, FaqItem } from "@/lib/faq/schema";
import { FaqOutput } from "./FaqOutput";
import { CheckCircle, Sparkle, Trash } from "./Icons";

type Phase = "idle" | "loading" | "editing";

const DRAFT_KEY_PREFIX = "seo-checker:faq-draft:";

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toEditable(items: FaqItem[]): EditableFaq[] {
  return items.map((f) => ({ ...f, id: newId(), approved: false }));
}

function loadDraft(url: string): EditableFaq[] | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as EditableFaq[]) : null;
  } catch {
    return null;
  }
}

export function FaqSection({ result, enabled }: { result: AnalysisResult; enabled: boolean }) {
  const url = result.page.finalUrl;
  const [phase, setPhase] = useState<Phase>("idle");
  const [faqs, setFaqs] = useState<EditableFaq[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState<FaqItem[] | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // 診断し直したときは親が key={url} で再マウントするので、ここでは初期化だけ行う
  const [hasDraft, setHasDraft] = useState(() => loadDraft(url) !== null);

  const approved = useMemo(() => faqs.filter((f) => f.approved), [faqs]);

  const generate = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setOutput(null);
    try {
      const res = await fetch("/api/faq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          title: result.page.title,
          description: result.page.description,
          mainText: result.page.mainText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "FAQ 生成に失敗しました");
      setFaqs(toEditable(data.faqs as FaqItem[]));
      setPhase("editing");
    } catch (err) {
      setError((err as Error).message);
      setPhase("idle");
    }
  }, [url, result.page]);

  function restoreDraft() {
    const draft = loadDraft(url);
    if (!draft) return;
    setFaqs(draft);
    setPhase("editing");
    setOutput(null);
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY_PREFIX + url, JSON.stringify(faqs));
      setSavedAt(new Date().toLocaleTimeString("ja-JP"));
      setHasDraft(true);
    } catch {
      setError("下書きを保存できませんでした（ブラウザの保存領域が使えません）");
    }
  }

  function update(id: string, patch: Partial<EditableFaq>) {
    setFaqs((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function remove(id: string) {
    setFaqs((prev) => prev.filter((f) => f.id !== id));
  }

  function add() {
    setFaqs((prev) => [...prev, { id: newId(), question: "", answer: "", approved: false }]);
  }

  function build() {
    const items = approved
      .map((f) => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter((f) => f.question && f.answer);
    if (items.length === 0) return;
    setOutput(items);
  }

  return (
    <>
      <section className="print-card rounded-2xl bg-accent-soft p-5 ring-1 ring-accent/10 sm:p-6">
        <div className="flex gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <Sparkle className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-bold">FAQでAI検索(AIO)に強くする</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              AIがこのページの内容を分析し、想定FAQを作成します。FAQの構造化データ(JSON-LD)と適切なHTMLマークアップは、ChatGPT等のAI検索がページを正しく理解・引用するために非常に重要です。
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted">
              {[
                "AIがサイト内容を読み取り、想定される質問と回答を自動生成",
                "あなたが承認・編集したFAQだけを、正しいFAQPage構造化データ＋整ったHTMLに変換",
                "そのままサイトに設置すれば、AI検索での引用・露出の向上が期待できます",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {phase !== "editing" && (
          <div className="no-print mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={generate}
              disabled={!enabled || phase === "loading"}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-bold text-white shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkle className="h-5 w-5" />
              {phase === "loading" ? "AIがFAQを作成中…" : "AIでFAQを提案する"}
            </button>
            {hasDraft && (
              <button
                type="button"
                onClick={restoreDraft}
                className="rounded-xl border border-line bg-panel px-4 py-3 text-sm font-medium hover:bg-surface"
              >
                下書きを開く
              </button>
            )}
            {!enabled && (
              <span className="text-xs text-muted">
                サーバーに ANTHROPIC_API_KEY が設定されていないため、FAQ 生成は利用できません。
              </span>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-fail">{error}</p>}
      </section>

      {phase === "editing" && (
        <section className="print-card rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line sm:p-6">
          <h2 className="text-xl font-bold">AI提案FAQ</h2>
          <p className="mt-1 text-sm text-muted">
            AI提案です。内容を確認・編集し、公開するFAQに「承認」を付けてから生成してください。
          </p>

          <ul className="mt-4 space-y-3">
            {faqs.map((f) => (
              <li key={f.id} className="rounded-xl border border-line p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={f.approved}
                      onChange={(e) => update(f.id, { approved: e.target.checked })}
                      className="h-5 w-5 rounded border-line accent-accent"
                    />
                    承認
                  </label>
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    aria-label="このFAQを削除"
                    className="rounded-lg p-1.5 text-muted hover:bg-surface hover:text-fail"
                  >
                    <Trash className="h-5 w-5" />
                  </button>
                </div>
                <input
                  value={f.question}
                  onChange={(e) => update(f.id, { question: e.target.value })}
                  placeholder="質問"
                  className="mt-3 w-full rounded-lg border border-line px-3 py-2 text-base font-medium outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
                <textarea
                  value={f.answer}
                  onChange={(e) => update(f.id, { answer: e.target.value })}
                  placeholder="回答"
                  rows={3}
                  className="mt-2 w-full resize-y rounded-lg border border-line px-3 py-2 text-base leading-relaxed outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                />
              </li>
            ))}
          </ul>

          <div className="no-print mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={add}
              className="rounded-xl border border-line px-4 py-3 text-sm font-medium hover:bg-surface"
            >
              ＋ FAQを追加
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-xl border border-line px-4 py-3 text-sm font-medium hover:bg-surface"
            >
              下書き保存
            </button>
            {savedAt && <span className="text-xs text-muted">{savedAt} に保存しました</span>}
          </div>
          <div className="no-print mt-3">
            <button
              type="button"
              onClick={build}
              disabled={approved.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 font-bold text-white shadow-sm hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkle className="h-5 w-5" />
              承認済み{approved.length}件で生成
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-fail">{error}</p>}
        </section>
      )}

      {output && <FaqOutput faqs={output} />}
    </>
  );
}
