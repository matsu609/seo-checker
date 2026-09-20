import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { FeedbackCard } from "@/components/admin/FeedbackCard";
import { IntegrationsCard } from "@/components/admin/IntegrationsCard";
import { VersionCard } from "@/components/admin/VersionCard";
import { Callout } from "@/components/ui/Callout";
import { loadAgencies } from "@/lib/admin/agencies";
import { loadClients } from "@/lib/admin/clients";
import { isAdmin } from "@/lib/admin/guard";
import { DbError, isSupabaseConfigured } from "@/lib/db/supabase";
import { listAllFeedback } from "@/lib/feedback/store";
import type { FeedbackRecord } from "@/lib/feedback/types";

export const metadata: Metadata = {
  title: "マスター画面",
  description: "顧客ごとの契約状況・月額・クーポンの確認と、機能の個別開放・管理アカウントの管理。",
  // 運用者だけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

export default async function Page() {
  // 運用者ごとに変わるので、ビルド時に固めない
  await connection();

  // 管理者でなければ「そんな画面は無い」で返す（存在を教えない）
  if (!(await isAdmin())) notFound();

  let clients;
  let agencies;
  try {
    [clients, agencies] = await Promise.all([loadClients(), loadAgencies()]);
  } catch {
    return (
      <div className="mx-auto w-full max-w-5xl @container">
        <h1 className="mb-6 flex items-center gap-3 text-xl font-bold text-ink">
          <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
          マスター画面
        </h1>
        <Callout tone="fail" title="顧客の一覧を取得できませんでした">
          Clerk への接続に失敗しました。時間をおいて開き直してください。
        </Callout>
      </div>
    );
  }

  // お客様からのご意見・不具合（Supabase）。読めなくても画面全体は止めない
  let feedback: FeedbackRecord[] | null = null;
  let feedbackError: string | null = null;
  if (!isSupabaseConfigured()) {
    feedbackError = "保存先（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が未設定のため、ご意見は表示できません。";
  } else {
    try {
      feedback = await listAllFeedback();
    } catch (err) {
      feedbackError =
        err instanceof DbError && err.status === 404
          ? "feedback テーブルがありません。docs/dev/OPERATIONS.md の SQL（r127）を Supabase の SQL Editor で実行してください。"
          : "ご意見の一覧を取得できませんでした。時間をおいて開き直してください。";
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        マスター画面
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        登録しているすべてのお客様の契約状況・月額・クーポンを確認し、機能を個別に開放できます。
        管理アカウント（旧称: 代理店アカウント）を追加して、担当のお客様だけを見てもらうこともできます。
        金額と契約状況は Clerk Billing（決済は Stripe）の値をそのまま出しています。
      </p>

      <VersionCard />

      <div className="mb-6">
        <IntegrationsCard />
      </div>

      <div className="mb-6">
        <FeedbackCard initial={feedback} loadError={feedbackError} />
      </div>

      <AdminConsole
        freeRunLimit={clients.freeRunLimit}
        agencies={agencies}
        clients={clients.rows}
        totalCount={clients.totalCount}
        truncated={clients.truncated}
      />
    </div>
  );
}
