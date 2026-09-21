"use client";

/**
 * お客様カルテの記入画面。
 *
 * 作りの意図:
 * - **必須にしない。**書いた分だけ文章が良くなる、という作りにする（進捗は出すが強制しない）。
 * - 設問ごとに「なぜ聞くか」と「どこで使われるか」を必ず見せる。理由が分かると答えの質が上がる。
 * - 区切り（4 つ）ごとに保存。長いフォームを 1 回で埋めさせない。
 * - 保存は**いまの全答えを丸ごと送る**（差分にすると、別の端末で書いた分が消える事故が起きる）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KarteResponse } from "@/app/api/karte/route";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { KARTE_SECTIONS, type KarteQuestion, type KarteSectionId } from "@/lib/karte/questions";
import type { KarteAnswers } from "@/lib/karte/types";

type SaveState = { section: KarteSectionId | null; status: "idle" | "saving" | "saved" | "error"; message: string };

export function KarteView() {
  const [data, setData] = useState<KarteResponse | null>(null);
  const [answers, setAnswers] = useState<KarteAnswers>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ section: null, status: "idle", message: "" });
  // 保存の応答で上書きしないよう、いま編集中の値を保持する
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/karte", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as KarteResponse;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        if (!dirty.current) setAnswers(d.answers);
      })
      .catch(() => {
        if (alive) setLoadError("カルテを読み込めませんでした。時間をおいて開き直してください。");
      });
    return () => {
      alive = false;
    };
  }, []);

  const setAnswer = useCallback((id: string, value: string) => {
    dirty.current = true;
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setSave({ section: null, status: "idle", message: "" });
  }, []);

  const submit = useCallback(
    async (section: KarteSectionId) => {
      setSave({ section, status: "saving", message: "" });
      try {
        const res = await fetch("/api/karte", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers }),
        });
        const body = (await res.json().catch(() => null)) as (KarteResponse & { error?: string }) | null;
        if (!res.ok) throw new Error(body?.error ?? `保存できませんでした（HTTP ${res.status}）`);
        if (body) {
          setData(body);
          dirty.current = false;
          setAnswers(body.answers);
        }
        setSave({ section, status: "saved", message: "保存しました。ありがとうございます。" });
      } catch (err) {
        setSave({ section, status: "error", message: err instanceof Error ? err.message : "保存できませんでした" });
      }
    },
    [answers],
  );

  const bySection = useMemo(() => {
    const map = new Map<KarteSectionId, KarteQuestion[]>();
    for (const q of data?.questions ?? []) {
      const list = map.get(q.section) ?? [];
      list.push(q);
      map.set(q.section, list);
    }
    return map;
  }, [data]);

  // 進捗は「保存済み」ではなく「いま画面にある答え」で出す（書いた手応えをすぐ返す）
  const progress = useMemo(() => {
    const total = data?.questions.length ?? 0;
    const answered = (data?.questions ?? []).filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
    return { answered, total, percent: total === 0 ? 0 : Math.round((answered / total) * 100) };
  }, [data, answers]);

  if (loadError) return <Callout tone="warn">{loadError}</Callout>;
  if (!data) return <p className="text-[13px] text-muted">読み込み中…</p>;

  if (!data.available) {
    return (
      <Callout tone="warn">
        カルテの保存先がまだ設定されていません。運営者にお知らせください（運営者の方へ: Supabase に <code className="font-mono">karte_answers</code> テーブルを作成してください）。
      </Callout>
    );
  }

  return (
    <>
      <Card
        title="書いていただくほど、文章が「お店の言葉」になります"
        description="AI は与えられた材料でしか書けません。ここが空だと、どのお店にも当てはまる文章しか作れません。全部埋める必要はなく、書いた分だけ改修提案・原稿・口コミへの返信が変わります。"
        className="mb-4"
        actions={
          <Badge tone={progress.percent >= 80 ? "pass" : progress.percent > 0 ? "warn" : "neutral"} icon={false}>
            {progress.answered} / {progress.total} 問
          </Badge>
        }
      >
        <ProgressBar value={progress.answered} max={Math.max(1, progress.total)} label="記入の進み具合" />
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          {data.storeType ? (
            <>
              業種「{data.storeType}」に合わせた設問を出しています。
            </>
          ) : (
            <>
              設定の「会社・店舗の基本情報」で業種を選ぶと、業種に合わせた設問が増えます。
            </>
          )}
          {data.updatedAt && <> 最終更新 {new Date(data.updatedAt).toLocaleString("ja-JP")}。</>}
        </p>
      </Card>

      {KARTE_SECTIONS.map((section) => {
        const questions = bySection.get(section.id) ?? [];
        if (questions.length === 0) return null;
        const state = save.section === section.id ? save : null;
        return (
          <Card key={section.id} title={section.label} description={section.description} className="mb-4">
            <div className="space-y-5">
              {questions.map((q) => (
                <QuestionField key={q.id} question={q} value={answers[q.id] ?? ""} onChange={setAnswer} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
              <Button size="sm" onClick={() => void submit(section.id)} loading={state?.status === "saving"}>
                この区切りを保存
              </Button>
              {state?.status === "saved" && <span className="text-[12px] text-pass">{state.message}</span>}
              {state?.status === "error" && <span className="text-[12px] text-fail">{state.message}</span>}
            </div>
          </Card>
        );
      })}
    </>
  );
}

function QuestionField({ question, value, onChange }: { question: KarteQuestion; value: string; onChange: (id: string, value: string) => void }) {
  const hint = (
    <>
      {question.why}
      <br />
      <span className="text-[11px]">使うところ: {question.usedBy.join(" / ")}</span>
    </>
  );
  return (
    <Field label={question.label} htmlFor={`karte-${question.id}`} hint={hint}>
      {question.kind === "choice" ? (
        <Select id={`karte-${question.id}`} value={value} onChange={(e) => onChange(question.id, e.target.value)}>
          <option value="">（選んでください）</option>
          {(question.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : question.kind === "long" ? (
        <Textarea
          id={`karte-${question.id}`}
          rows={3}
          maxLength={question.max}
          value={value}
          placeholder={question.placeholder}
          onChange={(e) => onChange(question.id, e.target.value)}
        />
      ) : (
        <Input
          id={`karte-${question.id}`}
          maxLength={question.max}
          value={value}
          placeholder={question.placeholder}
          onChange={(e) => onChange(question.id, e.target.value)}
        />
      )}
    </Field>
  );
}
