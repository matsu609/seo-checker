/**
 * マスター画面（運用者だけ）。
 *
 * ここに置くのは**システム・バックエンド側**のものだけ（利用者の指示 2026-09-20）。
 *   動いているコミットと版 / 外部連携（API キー）の設定状況 / 定期処理（Cron）の状況
 *
 * お客様の契約状況・ご利用状況は顧客管理（/clients。管理アカウントも開ける）、
 * ご意見・不具合への返答は /admin/feedback（運用者だけ）。サイドバーでは
 * 「管理者用」と「マスターアカウント用」の 2 つのタブに分けている（利用者の指示 2026-09-21）。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { IntegrationsCard } from "@/components/admin/IntegrationsCard";
import { JobsCard } from "@/components/admin/JobsCard";
import { VersionCard } from "@/components/admin/VersionCard";
import { isAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "マスター画面",
  description: "版・外部連携・定期処理などシステム側の確認。",
  // 運用者だけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

export default async function Page() {
  // 運用者ごとに変わるので、ビルド時に固めない
  await connection();

  // 管理者でなければ「そんな画面は無い」で返す（存在を教えない）
  if (!(await isAdmin())) notFound();

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        マスター画面
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        システム側（動いている版・外部連携の設定状況・定期処理）の確認を行います。管理アカウントの追加・解除は
        サイドバーの「管理アカウント」です。
        お客様からの{" "}
        <Link href="/admin/feedback" className="text-accent underline">
          ご意見・不具合
        </Link>
        も運用者だけが返答します。お客様の契約状況・ご利用状況は{" "}
        <Link href="/clients" className="text-accent underline">
          顧客管理
        </Link>
        で、こちらは管理アカウントからも開けます。
      </p>

      <VersionCard />

      <div className="mb-6">
        <IntegrationsCard />
      </div>

      <JobsCard />
    </div>
  );
}
