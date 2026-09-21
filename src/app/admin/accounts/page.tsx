/**
 * 管理アカウントの追加・解除（運用者 = マスターだけ）。
 *
 * 2026-09-21 にマスター画面（/admin）から切り出して、サイドバーの
 * 「マスターアカウント用」タブの 1 項目にした（利用者の指示）。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { AgencyPanel } from "@/components/admin/AgencyPanel";
import { Callout } from "@/components/ui/Callout";
import { loadAgencies } from "@/lib/admin/agencies";
import { isAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "管理アカウント",
  description: "お客様の対応をしていただく管理アカウントの追加・解除。",
  // 運用者だけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

function Heading() {
  return (
    <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
      <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
      管理アカウント
    </h1>
  );
}

export default async function Page() {
  // 追加・解除のたびに変わるので、ビルド時に固めない
  await connection();

  // 運用者でなければ「そんな画面は無い」で返す（存在を教えない）
  if (!(await isAdmin())) notFound();

  let agencies;
  try {
    agencies = await loadAgencies();
  } catch {
    return (
      <div className="mx-auto w-full max-w-5xl @container">
        <Heading />
        <Callout tone="fail" title="管理アカウントの一覧を取得できませんでした">
          Clerk への接続に失敗しました。時間をおいて開き直してください。
        </Callout>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <Heading />
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        お客様の対応をしていただく方のアカウントです。追加すると{" "}
        <Link href="/clients" className="text-accent underline">
          顧客管理
        </Link>
        が開けるようになり、すべてのお客様の契約状況・ご利用状況を見て、割引・機能の開放・お客様の画面の確認ができます。
        マスター画面とご意見・不具合、お客様向けのツールは見えません。
      </p>

      <AgencyPanel initial={agencies} />
    </div>
  );
}
