/**
 * マスター画面（運用者だけ）。
 *
 * ここに置くのは**システム・バックエンド側**のものだけ（利用者の指示 2026-09-20）。
 *   動いているコミットと版 / 外部連携（API キー）の設定状況 / 定期処理（Cron）の状況 /
 *   管理アカウントの追加・解除
 *
 * お客様の契約状況・ご利用状況・ご意見への返答は顧客管理（/clients）へ移した。
 * 管理アカウントにも同じ画面を見せ、お問い合わせをその画面で完結させるため。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { AgencyPanel } from "@/components/admin/AgencyPanel";
import { IntegrationsCard } from "@/components/admin/IntegrationsCard";
import { JobsCard } from "@/components/admin/JobsCard";
import { VersionCard } from "@/components/admin/VersionCard";
import { Callout } from "@/components/ui/Callout";
import { loadAgencies } from "@/lib/admin/agencies";
import { isAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "マスター画面",
  description: "版・外部連携・定期処理などシステム側の確認と、管理アカウントの追加・解除。",
  // 運用者だけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

export default async function Page() {
  // 運用者ごとに変わるので、ビルド時に固めない
  await connection();

  // 管理者でなければ「そんな画面は無い」で返す（存在を教えない）
  if (!(await isAdmin())) notFound();

  let agencies;
  try {
    agencies = await loadAgencies();
  } catch {
    return (
      <div className="mx-auto w-full max-w-5xl @container">
        <h1 className="mb-6 flex items-center gap-3 text-xl font-bold text-ink">
          <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
          マスター画面
        </h1>
        <Callout tone="fail" title="管理アカウントの一覧を取得できませんでした">
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
        システム側（動いている版・外部連携の設定状況・定期処理）の確認と、管理アカウントの追加・解除を行います。
        お客様の契約状況・ご利用状況・ご意見への返答は{" "}
        <Link href="/clients" className="text-accent underline">
          顧客管理
        </Link>
        に移りました（管理アカウントからも同じ画面が開けます）。
      </p>

      <VersionCard />

      <div className="mb-6">
        <IntegrationsCard />
      </div>

      <div className="mb-6">
        <JobsCard />
      </div>

      <AgencyPanel initial={agencies} />
    </div>
  );
}
