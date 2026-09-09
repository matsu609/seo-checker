import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ClientTable } from "@/components/admin/ClientTable";
import { VersionCard } from "@/components/admin/VersionCard";
import { Callout } from "@/components/ui/Callout";
import { loadClients } from "@/lib/admin/clients";
import { isAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "マスター画面",
  description: "顧客ごとの契約状況・月額・クーポンの確認と、機能の個別開放。",
  // 運用者だけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

export default async function Page() {
  // 運用者ごとに変わるので、ビルド時に固めない
  await connection();

  // 管理者でなければ「そんな画面は無い」で返す（存在を教えない）
  if (!(await isAdmin())) notFound();

  let clients;
  try {
    clients = await loadClients();
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
        顧客ごとの契約状況・月額・クーポンを確認し、機能を個別に開放できます。
        金額と契約状況は Clerk Billing（決済は Stripe）の値をそのまま出しています。
      </p>

      <VersionCard />

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-muted">
        <span>
          顧客 <span className="font-bold text-ink tabular-nums">{clients.totalCount}</span> 件
        </span>
        {clients.truncated > 0 && <span>（新しい順に {clients.rows.length} 件を表示）</span>}
      </div>

      <ClientTable initial={clients.rows} />
    </div>
  );
}
