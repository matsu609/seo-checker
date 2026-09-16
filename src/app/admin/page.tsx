import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminConsole } from "@/components/admin/AdminConsole";
import { IntegrationsCard } from "@/components/admin/IntegrationsCard";
import { VersionCard } from "@/components/admin/VersionCard";
import { Callout } from "@/components/ui/Callout";
import { loadAgencies } from "@/lib/admin/agencies";
import { loadClients } from "@/lib/admin/clients";
import { isAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "マスター画面",
  description: "顧客ごとの契約状況・月額・クーポンの確認と、機能の個別開放・代理店の管理。",
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

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        マスター画面
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        登録しているすべてのお客様の契約状況・月額・クーポンを確認し、機能を個別に開放できます。
        代理店アカウントを追加して、担当のお客様だけを見てもらうこともできます。
        金額と契約状況は Clerk Billing（決済は Stripe）の値をそのまま出しています。
      </p>

      <VersionCard />

      <div className="mb-6">
        <IntegrationsCard />
      </div>

      <AdminConsole
        agencies={agencies}
        clients={clients.rows}
        totalCount={clients.totalCount}
        truncated={clients.truncated}
      />
    </div>
  );
}
