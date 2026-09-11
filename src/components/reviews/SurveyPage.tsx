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
 *
 * 文言は locale（端末の言語から判定。右上の切替で変更）の辞書（i18n.ts）。質問文・選択肢はサーバーが訳して渡す。
 * 選択肢は訳を表示しつつ、送る値は日本語の原文（店舗側は日本語のまま見られる）。
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PublicAnswerResponse } from "@/app/api/r/[slug]/answers/route";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Field, Input, Textarea } from "@/components/ui/Field";
import type { PublicQuestion, PublicReviewForm } from "@/lib/reviews/forms";
import { LOCALE_HTML_LANG, LOCALE_NAMES, SURVEY_LOCALES, surveyStrings, type SurveyLocale, type SurveyStrings } from "@/lib/reviews/i18n";
import { DIRECT_CONTACT_MAX, DIRECT_MESSAGE_MAX, DRAFT_MAX, TEXT_ANSWER_MAX, type AnswerValue } from "@/lib/reviews/questions";

export interface SurveyPageProps {
  slug: string;
  code: string | null;
  form: PublicReviewForm | null;
  error: string | null;
  /** 表示する言語（サーバーで端末の言語から判定。切替は ?lang= で再表示） */
  locale: SurveyLocale;
}

type Phase =
  | { kind: "answering" }
  | { kind: "sending" }
  | { kind: "done"; result: PublicAnswerResponse; draft: string; copied: boolean; clicked: boolean }
  | { kind: "direct"; result: PublicAnswerResponse; sent: boolean };

async function errorMessage(res: Response, t: SurveyStrings): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答
  }
  return t.errorHttp(res.status);
}

export function SurveyPage({ slug, code, form, error, locale }: SurveyPageProps) {
  const t = surveyStrings(locale);
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [phase, setPhase] = useState<Phase>({ kind: "answering" });
  const [formError, setFormError] = useState<string | null>(null);
  const [directMessage, setDirectMessage] = useState("");
  const [directContact, setDirectContact] = useState("");
  const [directBusy, setDirectBusy] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);

  /** 言語の切替: ?lang= を付けて同じ画面を出し直す（回答の途中でも入力は残る） */
  function changeLocale(next: SurveyLocale) {
    const params = new URLSearchParams();
    if (code) params.set("c", code);
    params.set("lang", next);
    router.replace(`/r/${encodeURIComponent(slug)}?${params.toString()}`);
  }

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
        setFormError(t.errorRequired(q.label));
        return;
      }
    }
    if (Object.keys(answers).length === 0) {
      setFormError(t.errorAtLeastOne);
      return;
    }
    setFormError(null);
    setPhase({ kind: "sending" });
    try {
      const res = await fetch(`/api/r/${encodeURIComponent(slug)}/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code ?? undefined, lang: locale, answers }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, t));
      const result = (await res.json()) as PublicAnswerResponse;
      setPhase({ kind: "done", result, draft: result.draft ?? "", copied: false, clicked: false });
      window.scrollTo({ top: 0 });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t.errorSendFailed);
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
      setDirectError(t.directRequired);
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
      if (!res.ok) throw new Error(await errorMessage(res, t));
      setPhase({ ...phase, sent: true });
    } catch (err) {
      setDirectError(err instanceof Error ? err.message : t.errorSendFailed);
    } finally {
      setDirectBusy(false);
    }
  }

  return (
    <main lang={LOCALE_HTML_LANG[locale]} className="mx-auto w-full max-w-lg px-4 py-6 md:py-10">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] text-muted">{t.eyebrow}</p>
          <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
            <span className="sr-only">{t.languageLabel}</span>
            <span aria-hidden>🌐</span>
            <select
              aria-label={t.languageLabel}
              value={locale}
              onChange={(e) => changeLocale(e.target.value as SurveyLocale)}
              className="rounded-sm border border-line bg-panel px-1.5 py-1 text-[12px] text-ink"
            >
              {SURVEY_LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LOCALE_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <h1 className="mt-1 text-xl font-bold text-ink">{form?.storeName ?? t.fallbackTitle}</h1>
        {form && <p className="mt-1 text-[13px] text-muted">{form.title}</p>}
      </header>

      {error && (
        <Callout tone="warn" title={t.cannotShow}>
          {error}
        </Callout>
      )}

      {form && (phase.kind === "answering" || phase.kind === "sending") && (
        <form onSubmit={onSubmit} className="space-y-6" aria-busy={phase.kind === "sending"}>
          <p className="text-sm leading-relaxed text-ink">{t.intro}</p>
          {form.questions.map((q, i) => (
            <QuestionField key={q.id} index={i + 1} question={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} t={t} />
          ))}
          {formError && (
            <Callout tone="fail">{formError}</Callout>
          )}
          <Button type="submit" size="lg" className="w-full" loading={phase.kind === "sending"}>
            {phase.kind === "sending" ? t.sending : t.submit}
          </Button>
          <p className="text-[11px] leading-relaxed text-muted">
            {t.footer}{" "}
            <Link href="/privacy" className="underline" target="_blank" rel="noopener noreferrer">
              {t.privacy}
            </Link>
          </p>
        </form>
      )}

      {phase.kind === "done" && (
        <div className="space-y-6">
          <Callout tone="pass" title={t.doneTitle}>
            {t.doneBody}
          </Callout>

          {phase.draft || phase.result.draft ? (
            <section className="rounded-sm border border-line bg-panel p-4">
              <h2 className="text-base font-bold text-ink">{t.draftTitle}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{phase.result.draftSource === "ai" ? t.draftHintAi : t.draftHintFallback}</p>
              <Textarea
                aria-label={t.draftAria}
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
                {t.postToGoogle}
              </Button>
            )}
            {phase.result.isLow && (
              <Button type="button" size="lg" variant="secondary" className="w-full" onClick={() => setPhase({ kind: "direct", result: phase.result, sent: false })}>
                {t.tellStore}
              </Button>
            )}
          </div>
          {phase.clicked && (
            <Callout tone="info">
              {phase.copied ? t.copied : t.notCopied} {t.afterClick}
            </Callout>
          )}
          <p className="text-[11px] leading-relaxed text-muted">{t.disclaimer}</p>
        </div>
      )}

      {phase.kind === "direct" && (
        <div className="space-y-6">
          {phase.sent ? (
            <Callout tone="pass" title={t.directSentTitle}>
              {t.directSentBody}
            </Callout>
          ) : (
            <form onSubmit={onSendDirect} className="space-y-4" aria-busy={directBusy}>
              <h2 className="text-base font-bold text-ink">{t.directTitle}</h2>
              <p className="text-[13px] leading-relaxed text-muted">{t.directHint}</p>
              <Field label={t.directMessage} htmlFor="direct-message" required>
                <Textarea
                  id="direct-message"
                  rows={6}
                  maxLength={DIRECT_MESSAGE_MAX}
                  value={directMessage}
                  onChange={(e) => setDirectMessage(e.target.value)}
                />
              </Field>
              <Field label={t.directContact} htmlFor="direct-contact" hint={t.directContactHint}>
                <Input id="direct-contact" maxLength={DIRECT_CONTACT_MAX} value={directContact} onChange={(e) => setDirectContact(e.target.value)} />
              </Field>
              {directError && <Callout tone="fail">{directError}</Callout>}
              <div className="grid gap-3">
                <Button type="submit" size="lg" className="w-full" loading={directBusy}>
                  {t.send}
                </Button>
                <Button type="button" size="lg" variant="ghost" className="w-full" onClick={() => setPhase({ kind: "done", result: phase.result, draft: phase.result.draft ?? "", copied: false, clicked: false })}>
                  {t.back}
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
  t,
}: {
  index: number;
  question: PublicQuestion;
  value: AnswerValue | undefined;
  onChange: (v: AnswerValue | undefined) => void;
  t: SurveyStrings;
}) {
  const label = (
    <span>
      <span className="mr-1 tabular-nums text-muted">
        {t.questionPrefix}
        {index}.
      </span>
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
              {t.required}
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
                aria-label={`${n} (${t.ratingLabels[n - 1]})`}
                onClick={() => onChange(n)}
                className={`flex h-14 flex-col items-center justify-center rounded-md border text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                  selected ? "border-accent bg-accent text-on-brand" : "border-line bg-panel text-ink hover:bg-surface"
                }`}
              >
                <span className="text-lg leading-none">{n}</span>
                <span className="mt-1 text-[10px] font-normal leading-none">{t.ratingLabels[n - 1]}</span>
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
            <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-panel px-3 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
              <input type="radio" name={question.id} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="h-4 w-4 accent-accent" />
              {o.label}
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
            const checked = list.includes(o.value);
            return (
              <label key={o.value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-line bg-panel px-3 text-sm text-ink has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                <input
                  type="checkbox"
                  value={o.value}
                  checked={checked}
                  onChange={() => {
                    const next = checked ? list.filter((x) => x !== o.value) : [...list, o.value];
                    onChange(next.length > 0 ? next : undefined);
                  }}
                  className="h-4 w-4 accent-accent"
                />
                {o.label}
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
        placeholder={t.textPlaceholder}
      />
    </Field>
  );
}
