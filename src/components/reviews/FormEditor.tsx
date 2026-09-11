"use client";

/**
 * アンケートの設定（質問・AI 下書きのトーンとキーワード・低評価の基準・投稿先・有効 / 無効）。
 * 画面の状態はここで持ち、保存ボタンで PUT /api/reviews/forms/[id] に送る。
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { ReviewForm } from "@/lib/reviews/forms";
import {
  INDUSTRIES,
  INDUSTRY_LABELS,
  LABEL_MAX,
  MAX_KEYWORDS,
  MAX_OPTIONS,
  MAX_QUESTIONS,
  newQuestionId,
  OPTION_MAX,
  parseKeywords,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  questionsFromTemplate,
  QuestionsSchema,
  STORE_NAME_MAX,
  TITLE_MAX,
  TONE_LABELS,
  TONES,
  type Industry,
  type QuestionType,
  type ReviewQuestion,
  type Tone,
} from "@/lib/reviews/questions";

export interface FormEditorProps {
  number: number;
  form: ReviewForm;
  /** 保存する。成功したら更新後のフォームを返す。失敗なら例外 */
  onSave: (patch: {
    title: string;
    storeName: string;
    placeId: string | null;
    writeReviewUrl: string | null;
    questions: ReviewQuestion[];
    settings: ReviewForm["settings"];
    active: boolean;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
}

interface Draft {
  title: string;
  storeName: string;
  placeId: string;
  writeReviewUrl: string;
  questions: ReviewQuestion[];
  industry: Industry;
  tone: Tone;
  keywords: string;
  lowRatingMax: number;
  active: boolean;
}

function toDraft(form: ReviewForm): Draft {
  return {
    title: form.title,
    storeName: form.storeName,
    placeId: form.placeId ?? "",
    writeReviewUrl: form.writeReviewUrl ?? "",
    questions: form.questions.map((q) => ({ ...q, options: [...q.options] })),
    industry: form.settings.industry,
    tone: form.settings.tone,
    keywords: form.settings.keywords.join(", "),
    lowRatingMax: form.settings.lowRatingMax,
    active: form.active,
  };
}

export function FormEditor({ number, form, onSave, onDelete }: FormEditorProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(form));
  const [seenId, setSeenId] = useState(form.id);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 別のアンケートに切り替わったら入力欄も差し替える（描画中の派生 state）
  if (seenId !== form.id) {
    setSeenId(form.id);
    setDraft(toDraft(form));
    setError(null);
    setNotice(null);
    setConfirmDelete(false);
  }

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setNotice(null);
  }

  function updateQuestion(index: number, patch: Partial<ReviewQuestion>) {
    setDraft((d) => {
      const questions = d.questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
      return { ...d, questions };
    });
    setNotice(null);
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    setDraft((d) => {
      const to = index + dir;
      if (to < 0 || to >= d.questions.length) return d;
      const questions = [...d.questions];
      const [q] = questions.splice(index, 1);
      questions.splice(to, 0, q!);
      return { ...d, questions };
    });
  }

  function addQuestion(type: QuestionType) {
    setDraft((d) => {
      if (d.questions.length >= MAX_QUESTIONS) return d;
      const used = new Set(d.questions.map((q) => q.id));
      let id = newQuestionId();
      while (used.has(id)) id = newQuestionId();
      const options = type === "single" || type === "multi" ? ["選択肢 1", "選択肢 2"] : [];
      return { ...d, questions: [...d.questions, { id, type, label: "", options, required: false }] };
    });
  }

  function removeQuestion(index: number) {
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== index) }));
  }

  function applyTemplate(industry: Industry) {
    if (!window.confirm(`質問を「${INDUSTRY_LABELS[industry]}」のテンプレートに置き換えます。いまの質問は消えます。よろしいですか？`)) return;
    setDraft((d) => ({ ...d, industry, questions: questionsFromTemplate(industry) }));
  }

  async function save() {
    setError(null);
    setNotice(null);
    const questions = QuestionsSchema.safeParse(draft.questions);
    if (!questions.success) {
      setError(questions.error.issues[0]?.message ?? "質問の内容を確認してください");
      return;
    }
    if (!draft.title.trim()) {
      setError("アンケートの名前を入力してください");
      return;
    }
    if (!draft.storeName.trim()) {
      setError("店名を入力してください");
      return;
    }
    const placeId = draft.placeId.trim();
    const writeReviewUrl = draft.writeReviewUrl.trim();
    if (writeReviewUrl && !/^https:\/\//.test(writeReviewUrl)) {
      setError("投稿 URL は https:// から始まる URL を入力してください");
      return;
    }
    setBusy("save");
    try {
      await onSave({
        title: draft.title.trim(),
        storeName: draft.storeName.trim(),
        placeId: placeId || null,
        writeReviewUrl: writeReviewUrl || null,
        questions: questions.data,
        settings: { industry: draft.industry, tone: draft.tone, keywords: parseKeywords(draft.keywords), lowRatingMax: draft.lowRatingMax },
        active: draft.active,
      });
      setNotice("保存しました。");
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
      await onDelete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setBusy(null);
    }
  }

  const hasRating = draft.questions.some((q) => q.type === "rating");

  return (
    <Card
      number={number}
      title="アンケートの設定"
      description="質問の並びと、AI が作る口コミ下書きのトーン・含めたい語、低評価の基準を決めます。変更は保存ボタンで反映されます。"
      actions={
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={draft.active} onChange={(e) => update("active", e.target.checked)} className="h-4 w-4 accent-accent" />
          受付中
        </label>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="アンケートの名前" htmlFor="form-title" hint="来店客の画面に出ます（例: ご来店アンケート）">
          <Input id="form-title" maxLength={TITLE_MAX} value={draft.title} onChange={(e) => update("title", e.target.value)} />
        </Field>
        <Field label="店名" htmlFor="form-store" hint="来店客の画面の見出しと、AI 下書きの店舗名に使います">
          <Input id="form-store" maxLength={STORE_NAME_MAX} value={draft.storeName} onChange={(e) => update("storeName", e.target.value)} />
        </Field>
        <Field label="Google マップの Place ID（任意）" htmlFor="form-place" hint="投稿 URL を空にすると、この ID から投稿画面の URL を組み立てます">
          <Input id="form-place" value={draft.placeId} onChange={(e) => update("placeId", e.target.value)} placeholder="ChIJ…" />
        </Field>
        <Field label="口コミ投稿画面の URL（任意）" htmlFor="form-url" hint="空で Place ID も無いと、来店客の画面に投稿ボタンが出ません">
          <Input id="form-url" value={draft.writeReviewUrl} onChange={(e) => update("writeReviewUrl", e.target.value)} placeholder="https://search.google.com/local/writereview?placeid=…" />
        </Field>
      </div>

      <h3 className="mt-6 text-sm font-bold text-ink">AI 下書き</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-3">
        <Field label="トーン" htmlFor="form-tone">
          <Select id="form-tone" value={draft.tone} onChange={(e) => update("tone", e.target.value as Tone)}>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {TONE_LABELS[t]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`含めたい語（最大 ${MAX_KEYWORDS}、カンマ区切り）`} htmlFor="form-keywords" hint="店名・看板メニューなど。回答の内容と自然につながるときだけ使われます" className="md:col-span-2">
          <Input id="form-keywords" value={draft.keywords} onChange={(e) => update("keywords", e.target.value)} placeholder="例: 〇〇食堂, 名物カレー" />
        </Field>
      </div>

      <h3 className="mt-6 text-sm font-bold text-ink">低評価の基準</h3>
      <div className="mt-2 grid gap-4 md:grid-cols-3">
        <Field label="この評価以下を「低評価」にする" htmlFor="form-low" hint={hasRating ? "低評価は店舗に先に知らされ、来店客の画面に「お店に直接伝える」が並びます" : "評価（1〜5）の質問が無いので判定されません"}>
          <Select id="form-low" value={String(draft.lowRatingMax)} onChange={(e) => update("lowRatingMax", Number(e.target.value))}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} 以下
              </option>
            ))}
          </Select>
        </Field>
        <Field label="業種（テンプレート）" htmlFor="form-industry" hint="選ぶと質問をテンプレートに置き換えます">
          <Select id="form-industry" value={draft.industry} onChange={(e) => applyTemplate(e.target.value as Industry)}>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {INDUSTRY_LABELS[i]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink">
          質問（{draft.questions.length} / {MAX_QUESTIONS}）
        </h3>
        <div className="flex flex-wrap gap-2">
          {QUESTION_TYPES.map((t) => (
            <Button key={t} type="button" size="sm" variant="secondary" disabled={draft.questions.length >= MAX_QUESTIONS} onClick={() => addQuestion(t)}>
              + {QUESTION_TYPE_LABELS[t]}
            </Button>
          ))}
        </div>
      </div>
      <ol className="mt-3 space-y-3">
        {draft.questions.map((q, i) => (
          <li key={q.id} className="rounded-sm border border-line bg-surface p-3">
            <div className="flex flex-wrap items-start gap-2">
              <span className="mt-2.5 w-8 shrink-0 text-[13px] font-bold tabular-nums text-muted">Q{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-2">
                <div className="grid gap-2 md:grid-cols-[1fr_11rem]">
                  <Input
                    aria-label={`質問 ${i + 1} の文`}
                    maxLength={LABEL_MAX}
                    value={q.label}
                    onChange={(e) => updateQuestion(i, { label: e.target.value })}
                    placeholder="質問文"
                  />
                  <Select aria-label={`質問 ${i + 1} の種類`} value={q.type} onChange={(e) => {
                    const type = e.target.value as QuestionType;
                    const options = type === "single" || type === "multi" ? (q.options.length >= 2 ? q.options : ["選択肢 1", "選択肢 2"]) : [];
                    updateQuestion(i, { type, options });
                  }}>
                    {QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </Select>
                </div>
                {(q.type === "single" || q.type === "multi") && (
                  <Textarea
                    aria-label={`質問 ${i + 1} の選択肢（1 行に 1 つ）`}
                    rows={Math.min(MAX_OPTIONS, Math.max(2, q.options.length))}
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      updateQuestion(i, {
                        options: e.target.value
                          .split("\n")
                          .map((o) => o.trim().slice(0, OPTION_MAX))
                          .filter((o, idx, arr) => o && arr.indexOf(o) === idx)
                          .slice(0, MAX_OPTIONS),
                      })
                    }
                    placeholder={"選択肢を 1 行に 1 つ"}
                  />
                )}
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} className="h-4 w-4 accent-accent" />
                  必須にする
                </label>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button type="button" size="sm" variant="ghost" aria-label="上へ" disabled={i === 0} onClick={() => moveQuestion(i, -1)}>
                  ↑
                </Button>
                <Button type="button" size="sm" variant="ghost" aria-label="下へ" disabled={i === draft.questions.length - 1} onClick={() => moveQuestion(i, 1)}>
                  ↓
                </Button>
                <Button type="button" size="sm" variant="ghost" aria-label="削除" onClick={() => removeQuestion(i)}>
                  ×
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ol>

      {error && (
        <Callout tone="fail" className="mt-4">
          {error}
        </Callout>
      )}
      {notice && (
        <Callout tone="pass" className="mt-4">
          {notice}
        </Callout>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" onClick={save} loading={busy === "save"} disabled={busy !== null}>
          保存する
        </Button>
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-[13px] text-muted">
            回答と QR も消えます。
            <Button type="button" size="sm" variant="danger" onClick={remove} loading={busy === "delete"} disabled={busy !== null}>
              本当に削除する
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
              やめる
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            このアンケートを削除
          </Button>
        )}
      </div>
    </Card>
  );
}
