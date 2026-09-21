/**
 * お客様からのご意見・不具合（運用者 = マスターだけ）。
 *
 * ツールの右上「ご意見・不具合」から届いた報告を新しい順に出し、状態（未対応 / 対応中 / 対応済み）と
 * 返答をその場で書く。返答はお客様の設定画面「ご意見の履歴」に出る（メールは送らない）。
 *
 * 2026-09-21 に顧客管理（/clients）から切り離してここへ移した（利用者の指示。返答は運用者だけが行う）。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { FeedbackCard } from "@/components/admin/FeedbackCard";
import { isAdmin } from "@/lib/admin/guard";
import { DbError, isSupabaseConfigured } from "@/lib/db/supabase";
import { listAllFeedback } from "@/lib/feedback/store";
import type { FeedbackRecord } from "@/lib/feedback/types";

export const metadata: Metadata = {
  title: "ご意見・不具合",
  description: "お客様から届いたご意見・不具合の一覧と返答。",
  // 運用者だけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

export default async function Page() {
  // 届いている内容は人によって変わらないが、権限で出し分けるのでビルド時に固めない
  await connection();

  // 運用者でなければ「そんな画面は無い」で返す（存在を教えない）
  if (!(await isAdmin())) notFound();

  let feedback: FeedbackRecord[] | null = null;
  let loadError: string | null = null;
  if (!isSupabaseConfigured()) {
    loadError = "保存先（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が未設定のため、ご意見は表示できません。";
  } else {
    try {
      feedback = await listAllFeedback();
    } catch (err) {
      loadError =
        err instanceof DbError && err.status === 404
          ? "feedback テーブルがありません。docs/dev/OPERATIONS.md の SQL（r128）を Supabase の SQL Editor で実行してください。"
          : "ご意見の一覧を取得できませんでした。時間をおいて開き直してください。";
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        ご意見・不具合
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        お客様がツールの右上「ご意見・不具合」から送った内容です。返答するとお客様の設定画面「ご意見の履歴」に出ます
        （メールは送りません）。お客様ごとの契約状況は{" "}
        <Link href="/clients" className="text-accent underline">
          顧客管理
        </Link>
        で確認できます。
      </p>

      <FeedbackCard initial={feedback} loadError={loadError} />
    </div>
  );
}
