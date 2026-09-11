"use client";

/**
 * 来店客向けアンケート（/r/<slug>）。スマホで開く前提の 1 カラム。
 *
 * 1. 質問に答える（評価 / 選択 / 自由記述）
 * 2. 送信 → 回答は店舗に届く。回答をもとに作った口コミの下書きを見せ、自由に編集できる
 * 3. 「Google マップに投稿する」（評価に関係なく全員に同じ）。低評価のときは「お店に直接伝える」を並べて出す
 *
 * 投稿ボタンは下書きをコピーしてから Google の投稿画面を開く（Google 側に本文を渡す手段は無い）。
 * 押下は /api/r/[slug]/events に記録する（実際に投稿されたかは分からない）。
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { PublicAnswerResponse } from "@/app/api/r/[slug]/answers/route";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { PublicReviewForm } from "@/lib/reviews/forms";
import { DIRECT_CONTACT_MAX, DIRECT_MESSAGE_MAX, DRAFT_MAX, TEXT_ANSWER_MAX, type AnswerValue, type ReviewQuestion } from "@/lib/reviews/questions";

export interface SurveyPageProps {
  slug: string;
  code: string | null;
  form: PublicReviewForm | null;
  error: string | null;
}

type Phase =
  | { kind: "answering" }
  | { kind: "sending" }
  | { kind: "done"; result: PublicAnswerResponse; draft: string; copied: boolean; clicked: boolean }
  | { kind: "direct"; result: PublicAnswerResponse; sent: boolean };

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答
  }
  return `送信に失敗しました（HTTP ${res.status}）`;
}

const RATING_LABELS = ["不満", "やや不満", "ふつう", "満足", "とても満足"];

export function SurveyPage({ slug, code, form, error }: SurveyPageProps) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "answering" });
  const [formError, setFormError] = useState<string | null>(null);
  const [directMessage, setDirectMessage] = useState("");
  const [directContact, setDirectContact] = useState("");
  const [directBusy, setDirectBusy] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  function set(id: string, value: AnswerValue | undefined) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === undefined) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    for (const q of form.questions) {
      const v = answers[q.id];
      const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
      if (q.required && empty) {
        setFormError(`「${q.label}」に答えてください。`);
        return;
      }
    }
    if (Object.keys(answers).length === 0) {
      setFormError("1 つ以上の質問に答えてください。");
      return;
    }
    setFormError(null);
    setPhase({ kind: "sending" });
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(slug)}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code ?? undefined, answers }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      const result = (await res.json()) as PublicAnswerResponse;
      setPhase({ kind: "done", result, draft: result.draft ?? "", copied: false, clicked: false });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "送信に失敗しました");
      setPhase({ kind: "answering" });
    }
  }

  async function onPostToGoogle() {
    if (phase.kind !== "done" || !phase.result.writeReviewUrl) return;
    const text = phase.draft.trim();
    let copied = false;
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        copied = true;
      } catch {
        // クリップボードが使えない端末。本文は画面に残るので手でコピーできる
      }
    }
    // 画面遷移の前に押下を記録する（keepalive で送信を完了させる）
    void fetch(`/api/r/${encodeURIComponent(slug)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ responseId: phase.result.responseId, token: phase.result.token, draftFinal: text || undefined }),
      keepalive: true,
    }).catch(() => undefined);
    setPhase({ ...phase, copied, clicked: true });
    window.open(phase.result.writeReviewUrl, "_blank", "noopener,noreferrer");
  }

  async function onSendDirect(e: FormEvent) {
    e.preventDefault();
    if (phase.kind !== "direct") return;
    const message = directMessage.trim();
    if (!message) {
      setDirectError("お伝えしたい内容を入力してください。");
      return;
    }
    setDirectError(null);
    setDirectBusy(true);
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(slug)}/direct`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ responseId: phase.result.responseId, token: phase.result.token, message, contact: directContact.trim() || undefined }),
      });
      if (!res.ok) throw new Error(await errorMessage(res));
      setPhase({ ...phase, sent: true });
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setDirectBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-6 md:py-10">
      <header className="mb-6">
        <p className="text-[12px] text-muted">ご来店アンケート</p>
        <h1 className="mt-1 text-xl font-bold text-ink">{form?.storeName ?? "アンケート"}</h1>
        {form && <p className="mt-1 text-[13px] text-muted">{form.title}</p>}
      </header>

      {error && (
        <Callout tone="warn" title="アンケートを表示できません">
          {error}
        </Callout>
      )}

      {form && (phase.kind === "answering" || phase.kind === "sending") && (
        <form onSubmit={onSubmit} className="space-y-6" aria-busy={phase.kind === "sending"}>
          <p className="text-sm leading-relaxed text-ink">
            本日はご来店ありがとうございます。1 分ほどのアンケートにご協力ください。いただいた内容はお店に届きます。
          </p>
          {form.questions.map((q, i) => (
            <QuestionField key={q.id} index={i + 1} question={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
          ))}
          {formError && (
            <Callout tone="fail">{formError}</Callout>
          )}
          <Button type="submit" size="lg" className="w-full" loading={phase.kind === "sending"}>
            {phase.kind === "sending" ? "送信しています…" : "送信する"}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted">
            この画面は SEO 研究所が提供するアンケートです。回答は店舗に届き、店舗の改善に使われます。
            <Link href="/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              プライバシーポリシー
            </Link>
          </p>
        </form>
      )}

      {phase.kind === "done" && (
        <div className="space-y-6">
          <Callout tone="pass" title="店舗にフィードバックを送信しました">
            ご協力ありがとうございます。いただいた内容はお店に届きました。
          </Callout>

          {phase.draft || phase.result.draft ? (
            <section className="rounded-sm border border-line bg-panel p-4">
              <h2 className="text-base font-bold text-ink">口コミの下書き</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {phase.result.draftSource === "ai"
                  ? "ご回答をもとに下書きを作りました。内容はご自身の体験に合わせて自由に書き換えてください。そのまま使うこともできます。"
                  : "ご回答の文章をそのまま並べています。自由に書き換えてお使いください。"}
              </p>
              <Textarea
                aria-label="口コミの下書き"
                rows={8}
                maxLength={DRAFT_MAX}
                value={phase.draft}
                onChange={(e) => setPhase({ ...phase, draft: e.target.value, copied: false })}
                className="mt-3"
              />
              <p className="mt-1 text-right text-[11px] text-muted">
                {phase.draft.length} / {DRAFT_MAX}
              </p>
            </section>
          ) : null}

          {/* 投稿ボタンは評価に関係なく全員に同じ。低評価のときは「お店に直接伝える」を並列で足す（隠さない） */}
          <div className="grid gap-3">
            {phase.result.writeReviewUrl && (
              <Button type="button" size="lg" className="w-full" onClick={onPostToGoogle}>
                Google マップに投稿する
              </Button>
            )}
            {phase.result.isLow && (
              <Button type="button" size="lg" variant="secondary" className="w-full" onClick={() => setPhase({ kind: "direct", result: phase.result, sent: false })}>
                お店に直接伝える
              </Button>
            )}
          </div>
          {phase.clicked && (
            <Callout tone="info">
              {phase.copied ? "下書きをコピーしました。" : "下書きは上の欄にあります。"}
              Google マップの投稿画面が開くので、本文を貼り付けて、ご自身の判断で投稿してください。投稿するかどうかはご自由です。
            </Callout>
          )}
          <p className="text-[11px] leading-relaxed text-muted">
            口コミの投稿は任意です。投稿の有無で特典や扱いが変わることはありません。投稿される場合は、実際の体験にもとづく内容にしてください。
          </p>
        </div>
      )}

      {phase.kind === "direct" && (
        <div className="space-y-6">
          {phase.sent ? (
            <Callout tone="pass" title="お店に送信しました">
              ご意見をありがとうございます。お店が確認し、改善に活かします。
            </Callout>
          ) : (
            <form onSubmit={onSendDirect} className="space-y-4" aria-busy={directBusy}>
              <h2 className="text-base font-bold text-ink">お店に直接伝える</h2>
              <p className="text-[13px] leading-relaxed text-muted">
                ここに書いた内容は公開されず、お店にだけ届きます。
              </p>
              <Field label="お伝えしたい内容" htmlFor="direct-message" required>
                <Textarea
                  id="direct-message"
                  rows={6}
                  maxLength={DIRECT_MESSAGE_MAX}
                  value={directMessage}
                  onChange={(e) => setDirectMessage(e.target.value)}
                />
              </Field>
              <Field label="連絡先（任意）" htmlFor="direct-contact" hint="お店から返事が必要な場合だけ、メールアドレスか電話番号を入力してください">
                <Input id="direct-contact" maxLength={DIRECT_CONTACT_MAX} value={directContact} onChange={(e) => setDirectContact(e.target.value)} />
              </Field>
              {directError && <Callout tone="fail">{directError}</Callout>}
              <div className="grid gap-3">
                <Button type="submit" size="lg" className="w-full" loading={directBusy}>
                  送信する
                </Button>
                <Button type="button" size="lg" variant="ghost" className="w-full" onClick={() => setPhase({ kind: "done", result: phase.result, draft: phase.result.draft ?? "", copied: false, clicked: false })}>
                  戻る
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </main>
  );
}

function QuestionField({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: ReviewQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue | undefined) => void;
}) {
  const label = (
    <span>
      <span className="mr-1 tabular-nums text-muted">Q{index}.</span>
      {question.label}
    </span>
  );
  if (question.type === "rating") {
    const current = typeof value === "number" ? value : 0;
    return (
      <fieldset>
        <legend className="mb-2 block text-[13px] font-bold text-ink">
          {label}
          {question.required && (
            <span className="ml-1 text-[11px] font-normal text-fail" aria-hidden>
              必須
            </span>
          )}
        </legend>
        <div role="radiogroup" aria-label={question.label} className="grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((n) => {
            const selected = current === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${n}（${RATING_LABELS[n - 1]}）`}
                onClick={() => onChange(n)}
                className={`flex h-14 flex-col items-center justify-center rounded-md border text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  selected ? "border-accent bg-accent text-on-brand" : "border-line bg-panel text-ink hover:bg-surface"
                }`}
              >
                <span className="text-lg leading-none">{n}</span>
                <span className="mt-1 text-[10px] font-normal leading-none">{RATING_LABELS[n - 1]}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
    );
  }
  if (question.type === "single") {
    return (
      <fieldset>
        <legend className="mb-2 block text-[13px] font-bold text-ink">{label}</legend>
        <div className="grid gap-2">
          {question.options.map((o) => (
            <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-panel px-3 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name={question.id} value={o} checked={value === o} onChange={() => onChange(o)} className="h-4 w-4 accent-accent" />
              {o}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (question.type === "multi") {
    const list = Array.isArray(value) ? value : [];
    return (
      <fieldset>
        <legend className="mb-2 block text-[13px] font-bold text-ink">{label}</legend>
        <div className="grid gap-2">
          {question.options.map((o) => {
            const checked = list.includes(o);
            return (
              <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-panel px-3 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input
                  type="checkbox"
                  value={o}
                  checked={checked}
                  onChange={() => {
                    const next = checked ? list.filter((x) => x !== o) : [...list, o];
                    onChange(next.length > 0 ? next : undefined);
                  }}
                  className="h-4 w-4 accent-accent"
                />
                {o}
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  }
  return (
    <Field label={label} htmlFor={`q-${question.id}`} required={question.required}>
      <Textarea
        id={`q-${question.id}`}
        rows={4}
        maxLength={TEXT_ANSWER_MAX}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        placeholder="思い出したことを、そのままの言葉で"
      />
    </Field>
  );
}
