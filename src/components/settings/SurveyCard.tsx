"use client";

/**
 * ツールについてのアンケート（設定画面に、時期が来たときだけ出る）。
 *
 * 聞く相手は**このツールを使っている事業者（B）**。来店客に聞く口コミ支援のアンケート（C 向け）とは別物。
 *
 * 作りの意図:
 * - 時期が来ていなければ**何も出さない**（毎回出ていると、いざ出したときに読まれない）
 * - 1 回 4 問まで。その場で答えられる長さにする
 * - **「あとで」を必ず置く。**断れないアンケートは、次から嘘の答えが返ってくる
 * - 答えは運営者しか読まない（AI には渡さない）と明記する。正直に書いてもらうため
 */
import { useCallback, useEffect, useState } from "react";
import type { SurveyResponse } from "@/app/api/survey/route";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import type { SurveyDefinition } from "@/lib/survey/definitions";

export function SurveyCard() {
  const [survey, setSurvey] = useState<SurveyDefinition | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"answer" | "snooze" | null>(null);
  const [done, setDone] = useState<"answered" | "snoozed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/survey", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as SurveyResponse) : null))
      .then((d) => {
        if (alive && d?.available) setSurvey(d.survey);
      })
      .catch(() => {
        /* 出せなければ黙って何も出さない */
      });
    return () => {
      alive = false;
    };
  }, []);

  const send = useCallback(
    async (status: "answered" | "snoozed") => {
      if (!survey) return;
      setBusy(status === "answered" ? "answer" : "snooze");
      setError(null);
      try {
        const res = await fetch("/api/survey", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ surveyId: survey.id, status, answers }),
        });
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) throw new Error(body?.error ?? `送信できませんでした（HTTP ${res.status}）`);
        setDone(status);
      } catch (err) {
        setError(err instanceof Error ? err.message : "送信できませんでした");
      } finally {
        setBusy(null);
      }
    },
    [survey, answers],
  );

  if (done === "answered") {
    return (
      <Card title="アンケート">
        <Callout tone="pass">
          ご回答ありがとうございました。いただいた内容は運営者が必ず読み、次に作るものを決める材料にします。
        </Callout>
      </Card>
    );
  }
  if (done === "snoozed" || !survey) return null;

  const answered = survey.questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;

  return (
    <Card title={survey.label} description={survey.description}>
      <p className="mb-4 text-[12px] leading-relaxed text-muted">
        {survey.questions.length} 問です。答えられるものだけで構いません。いただいた内容は<strong className="text-ink">運営者だけが読みます</strong>（AI の文章には使いません）。
      </p>
      <div className="space-y-5">
        {survey.questions.map((q) => (
          <Field key={q.id} label={q.label} htmlFor={`survey-${q.id}`} hint={q.hint}>
            {q.kind === "choice" ? (
              <Select id={`survey-${q.id}`} value={answers[q.id] ?? ""} onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}>
                <option value="">（選んでください）</option>
                {(q.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            ) : q.kind === "long" ? (
              <Textarea
                id={`survey-${q.id}`}
                rows={3}
                maxLength={q.max}
                value={answers[q.id] ?? ""}
                placeholder={q.placeholder}
                onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
              />
            ) : (
              <Input
                id={`survey-${q.id}`}
                maxLength={q.max}
                value={answers[q.id] ?? ""}
                placeholder={q.placeholder}
                onChange={(e) => setAnswers((p) => ({ ...p, [q.id]: e.target.value }))}
              />
            )}
          </Field>
        ))}
      </div>
      {error && (
        <Callout tone="warn" className="mt-4">
          {error}
        </Callout>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <Button size="sm" onClick={() => void send("answered")} loading={busy === "answer"} disabled={answered === 0}>
          送信する
        </Button>
        <Button size="sm" variant="secondary" onClick={() => void send("snoozed")} loading={busy === "snooze"}>
          あとで
        </Button>
        <span className="text-[11px] text-muted">「あとで」を押すと 2 週間は出しません。</span>
      </div>
    </Card>
  );
}
