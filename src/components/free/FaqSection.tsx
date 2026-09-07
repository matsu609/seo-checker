"use client";

/**
 * 想定 FAQ（AI 生成）。レポートの中の任意セクション。
 *
 * 挙動と API 契約（POST /api/faq、下書きの localStorage キー）は従来のまま。
 * 見た目だけ新しいレポートのトークンに合わせ、編集 UI は no-print にしてある。
 */
import { useCallback, useMemo, useState } from "react";
import { Badge, Button } from "@/components/ui";
import type { AnalysisResult } from "@/lib/analyzer/types";
import type { EditableFaq, FaqItem } from "@/lib/faq/schema";
import { FaqOutput } from "./FaqOutput";
import { Sparkle, Trash } from "./Icons";
import { ReportSection, SubHeading } from "./report-parts";

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

export function FaqSection({
  result,
  enabled,
  number,
}: {
  result: AnalysisResult;
  enabled: boolean;
  number: number;
}) {
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

  // 生成前は紙に残すものが無いので、セクションごと印刷 / PDF から外す
  const printable = phase === "editing" || output !== null;

  return (
    <ReportSection
      number={number}
      className={printable ? "" : "no-print"}
      title={
        <span className="flex flex-wrap items-center gap-2">
          想定 FAQ（AI 生成）
          <Badge tone="info" icon={false}>
            任意・AI 生成
          </Badge>
        </span>
      }
      lead="FAQ の構造化データ（FAQPage）は、AI 検索がページの内容を正しく理解・引用するのに役立ちます。ページ本文から想定される質問と回答を AI が下書きし、承認したものだけを JSON-LD と HTML に変換します。"
    >
      {!enabled ? (
        <p className="no-print text-[13px] text-muted">
          サーバーに ANTHROPIC_API_KEY が設定されていないため、FAQ の生成は利用できません（診断結果には影響しません）。
        </p>
      ) : (
        phase !== "editing" && (
          <div className="no-print flex flex-wrap items-center gap-3">
            <Button onClick={generate} loading={phase === "loading"} icon={<Sparkle className="h-4 w-4" />}>
              {phase === "loading" ? "AI が FAQ を作成中…" : "AI で FAQ を提案する"}
            </Button>
            {hasDraft && (
              <Button variant="secondary" onClick={restoreDraft}>
                下書きを開く
              </Button>
            )}
          </div>
        )
      )}

      {phase === "editing" && (
        <div>
          <p className="no-print text-[13px] leading-relaxed text-muted">
            AI の下書きです。内容を確認・編集し、公開する FAQ に「承認」を付けてから生成してください。
          </p>
          <ul className="mt-3 space-y-3">
            {faqs.map((f) => (
              <li key={f.id} className="rounded-sm border border-line p-3 @md:p-4">
                <div className="no-print flex items-center justify-between">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] text-muted">
                    <input
                      type="checkbox"
                      checked={f.approved}
                      onChange={(e) => update(f.id, { approved: e.target.checked })}
                      className="h-4 w-4 rounded-sm border-line accent-accent"
                    />
                    承認
                  </label>
                  <button
                    type="button"
                    onClick={() => remove(f.id)}
                    aria-label="この FAQ を削除"
                    className="rounded-md p-1.5 text-muted outline-none hover:bg-surface hover:text-fail focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    <Trash className="h-4 w-4" />
                  </button>
                </div>
                <input
                  value={f.question}
                  onChange={(e) => update(f.id, { question: e.target.value })}
                  placeholder="質問"
                  aria-label="質問"
                  className="no-print mt-2 h-11 w-full rounded-md border border-line bg-panel px-3 text-base font-bold text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
                <textarea
                  value={f.answer}
                  onChange={(e) => update(f.id, { answer: e.target.value })}
                  placeholder="回答"
                  aria-label="回答"
                  rows={3}
                  className="no-print mt-2 w-full resize-y rounded-md border border-line bg-panel px-3 py-2 text-base leading-relaxed text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
                />
                {/* 入力欄は高さが固定で印刷すると途中で切れるため、紙にはテキストで出す */}
                <div className="print-only">
                  <div className="text-[14px] font-bold text-ink">Q. {f.question}</div>
                  <div className="mt-1 text-[13px] leading-relaxed text-muted">A. {f.answer}</div>
                </div>
              </li>
            ))}
          </ul>

          <div className="no-print mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={add}>
              ＋ FAQ を追加
            </Button>
            <Button variant="secondary" onClick={saveDraft}>
              下書き保存
            </Button>
            {savedAt && <span className="text-[11px] text-muted">{savedAt} に保存しました</span>}
          </div>
          <div className="no-print mt-3">
            <Button onClick={build} disabled={approved.length === 0} icon={<Sparkle className="h-4 w-4" />}>
              承認済み {approved.length} 件で生成
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p className="no-print mt-3 text-[13px] text-fail" role="alert">
          {error}
        </p>
      )}

      {output && (
        <div className="mt-6">
          <SubHeading note={`承認した ${output.length} 件から生成しました`}>生成結果</SubHeading>
          <FaqOutput faqs={output} />
        </div>
      )}
    </ReportSection>
  );
}
