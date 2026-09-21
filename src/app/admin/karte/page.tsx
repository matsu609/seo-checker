/**
 * お客様カルテの集計（運営者だけ）。
 *
 * 利用者の決定 2026-09-21「お客様の意見を集める場所をしっかり作り、今後の機能追加・
 * サービス改善・差別化・LTV 改善の起点にする」。ここが**次に何を作るかを決める画面**。
 *
 * 顧客ごとではなく**設問ごと**に並べる（同じ設問への答えを 3 つ並べると、共通する言葉が見える）。
 * 「ご要望」と「過去のご不満」は AI には渡していない運営者専用の答えなので、先頭に出す。
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Badge } from "@/components/ui/Badge";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { isAdmin } from "@/lib/admin/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { countByStoreType, groupByQuestion, type KarteSource } from "@/lib/karte/aggregate";
import { listKarte } from "@/lib/karte/store";

export const metadata: Metadata = {
  title: "お客様カルテの集計",
  description: "設問ごとに全お客様の答えを並べます。",
  robots: { index: false, follow: false },
};

export default async function Page() {
  await connection();
  if (!(await isAdmin())) notFound();

  let rows: KarteSource[] = [];
  let failed = false;
  if (isSupabaseConfigured()) {
    try {
      rows = await listKarte();
    } catch {
      failed = true;
    }
  } else {
    failed = true;
  }

  const questions = groupByQuestion(rows);
  const byType = countByStoreType(rows);
  const customers = rows.filter((r) => Object.keys(r.answers).length > 0).length;

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        お客様カルテの集計
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        お客様が{" "}
        <Link href="/karte" className="text-accent underline">
          カルテ
        </Link>
        に書いた答えを、設問ごとに並べています。同じ設問の答えを 3 つ並べて同じ言葉が出てきたら、それが次に作る機能です。
        「ご要望」と「過去のご不満」は AI には渡していない運営者専用の答えなので、先頭に出しています。
      </p>

      {failed && (
        <Callout tone="warn" className="mb-4">
          カルテを読み込めませんでした。Supabase の設定と <code className="font-mono">karte_answers</code> テーブルの作成（運用メモの SQL）を確認してください。
        </Callout>
      )}

      <Card title="いまの状況" className="mb-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="text-[11px] text-muted">記入いただいたお客様</div>
            <div className="text-[22px] font-bold leading-none text-ink tabular-nums">{customers}</div>
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[11px] text-muted">業種の内訳</div>
            <div className="flex flex-wrap gap-1.5">
              {byType.length === 0 ? (
                <span className="text-[12px] text-muted">まだありません</span>
              ) : (
                byType.map((t) => (
                  <Badge key={t.storeType} tone="neutral" icon={false}>
                    {t.storeType} {t.count}
                  </Badge>
                ))
              )}
            </div>
          </div>
        </div>
      </Card>

      {questions.length === 0 && !failed && (
        <Card title="まだ回答がありません">
          <p className="text-[13px] leading-relaxed text-ink">
            お客様が <Link href="/karte" className="text-accent underline">カルテ</Link> に記入すると、ここに設問ごとの答えが並びます。
            契約直後のご案内で「5 分で終わります」と伝えて書いていただくのが一番集まります。
          </p>
        </Card>
      )}

      {questions.map((q) => (
        <Card
          key={q.id}
          title={q.label}
          description={q.why}
          className="mb-4"
          actions={
            <div className="flex items-center gap-2">
              {q.operatorOnly && <Badge tone="warn" icon={false}>運営者だけが読む</Badge>}
              <Badge tone="neutral" icon={false}>{q.answers.length} 件</Badge>
            </div>
          }
        >
          <ul className="divide-y divide-line border-y border-line">
            {q.answers.map((a) => (
              <li key={`${q.id}-${a.userId}`} className="py-2.5">
                <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted">
                  <span className="font-bold text-ink">{a.company || "（会社名未設定）"}</span>
                  {a.storeType && <span>{a.storeType}</span>}
                  {a.updatedAt && <span className="tabular-nums">{a.updatedAt.slice(0, 10)}</span>}
                </div>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap text-ink">{a.value}</p>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
