/**
 * アンケートの集計（運営者だけ）。
 *
 * 聞く相手は**このツールを使っている事業者（B）**。利用者の指示 2026-09-21
 * 「アンケートはあくまでもツールのユーザー。to B の B」。
 *
 * カルテの集計と同じく**設問ごと**に並べる。選択肢は人数、自由記述は答えをそのまま全部出す
 * （数だけにすると、いちばん大事な言い回しが消える）。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { HBar } from "@/components/charts";
import { isAdmin } from "@/lib/admin/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { responseRate, summarizeSurveys } from "@/lib/survey/aggregate";
import { listSurveyRows, type SurveyRow } from "@/lib/survey/store";

export const metadata: Metadata = {
  title: "アンケートの集計",
  description: "ツールを使っている事業者からの回答を設問ごとに並べます。",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await connection();
  if (!(await isAdmin())) notFound();

  let rows: SurveyRow[] = [];
  let failed = false;
  if (isSupabaseConfigured()) {
    try {
      rows = await listSurveyRows();
    } catch {
      failed = true;
    }
  } else {
    failed = true;
  }

  const summaries = summarizeSurveys(rows);
  const total = summaries.reduce((a, s) => a + s.answered, 0);

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        アンケートの集計
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        <strong className="text-ink">ツールをお使いの事業者（お客様ご本人）</strong>に、登録から 14 日・3 か月・1 年の節目でお聞きしています。
        来店客に聞く口コミ支援のアンケートとは別のものです。お店のこと（AI の文章に使う材料）は{" "}
        <Link href="/admin/karte" className="text-accent underline">
          カルテの集計
        </Link>
        に、お客様から送られた不具合・要望は{" "}
        <Link href="/admin/feedback" className="text-accent underline">
          ご意見・不具合
        </Link>
        にあります。
      </p>

      {failed && (
        <Callout tone="warn" className="mb-4">
          アンケートを読み込めませんでした。Supabase の設定と <code className="font-mono">survey_answers</code> テーブルの作成（運用メモの SQL）を確認してください。
        </Callout>
      )}

      {total === 0 && !failed && (
        <Card title="まだ回答がありません" className="mb-4">
          <p className="text-[13px] leading-relaxed text-ink">
            登録から 14 日たったお客様の設定画面に、最初のアンケートが出ます。「あとで」を押された場合は 2 週間後にもう一度出ます。
          </p>
        </Card>
      )}

      {summaries.map((s) => {
        const rate = responseRate(s);
        return (
          <Card
            key={s.surveyId}
            title={s.label}
            description={s.description}
            className="mb-6"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.answered > 0 ? "pass" : "neutral"} icon={false}>
                  回答 {s.answered}
                </Badge>
                {s.snoozed > 0 && (
                  <Badge tone="neutral" icon={false}>
                    あとで {s.snoozed}
                  </Badge>
                )}
                {rate !== null && (
                  <Badge tone="neutral" icon={false}>
                    回答率 {Math.round(rate * 100)}%
                  </Badge>
                )}
              </div>
            }
          >
            {s.answered === 0 ? (
              <p className="text-[12px] text-muted">この回の回答はまだありません。</p>
            ) : (
              <div className="space-y-5">
                {s.questions.map((q) => (
                  <section key={q.id}>
                    <h3 className="mb-1.5 text-[13px] font-bold text-ink">{q.label}</h3>
                    {q.kind === "choice" ? (
                      q.choices.every((c) => c.count === 0) ? (
                        <p className="text-[12px] text-muted">回答なし</p>
                      ) : (
                        <HBar
                          rows={q.choices.map((c) => ({ label: c.option, value: c.count, valueLabel: `${c.count} 人` }))}
                          max={Math.max(1, ...q.choices.map((c) => c.count))}
                          valueTone="none"
                          ariaLabel={`${q.label}の回答の内訳`}
                        />
                      )
                    ) : q.answers.length === 0 ? (
                      <p className="text-[12px] text-muted">回答なし</p>
                    ) : (
                      <ul className="divide-y divide-line border-y border-line">
                        {q.answers.map((a) => (
                          <li key={`${q.id}-${a.userId}-${a.createdAt}`} className="py-2">
                            <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                              <span className="font-bold text-ink">{a.company || "（会社名未設定）"}</span>
                              {a.storeType && <span>{a.storeType}</span>}
                              <span className="tabular-nums">{a.createdAt.slice(0, 10)}</span>
                            </div>
                            <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{a.value}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
