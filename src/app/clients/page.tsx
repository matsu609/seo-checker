/**
 * 顧客管理の画面（サイドバー「管理者用」→「顧客管理」）。
 *
 * 運用者（マスター）と管理アカウントの両方が開く（利用者の決定 2026-09-20）。
 * お客様からお問い合わせ・クレームが来たときに見る場所:
 *   契約状況・月額・次回請求 → 登録情報と無料診断の回数 → 割引 → 機能の個別開放 →
 *   その方の画面を見る（代理ログイン）
 *
 * ご意見・不具合の一覧と返答は 2026-09-21 に /admin/feedback へ移した（運用者だけが返答する）。
 *
 * 見えるお客様も、できる操作も**運用者と管理アカウントで同じ**（利用者の指示 2026-09-21。
 * 担当による絞り込みは仕組みごとやめた）。違いはマスター画面（システム側）が見えるかどうかだけ。
 *
 * システム寄りのもの（版・外部連携・定期処理・管理アカウントの追加）はマスター画面
 * （/admin）に残してある。管理アカウントにはそちらを見せない。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { ClientTable } from "@/components/admin/ClientTable";
import { Callout } from "@/components/ui/Callout";
import { loadClients, type ClientRow } from "@/lib/admin/clients";
import { currentClientScope } from "@/lib/admin/guard";
import { freeRunLimit } from "@/lib/free/quota";

export const metadata: Metadata = {
  title: "顧客管理",
  description: "お客様の契約状況・ご利用状況の確認と、ご意見への返答・割引・機能の開放。",
  // 運用者と管理アカウントだけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

function Heading() {
  return (
    <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
      <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
      顧客管理
    </h1>
  );
}

export default async function Page() {
  // 立場ごとに中身が変わるので、ビルド時に固めない
  await connection();

  // 運用者でも管理アカウントでもなければ「そんな画面は無い」で返す（存在を教えない）
  const scope = await currentClientScope();
  if (!scope) notFound();
  const master = scope.kind === "master";

  let rows: ClientRow[];
  let totalCount = 0;
  let truncated = 0;
  let limit = freeRunLimit();
  try {
    // 見えるお客様は立場によらず全員（管理アカウント自身は顧客ではないので含まれない）
    const clients = await loadClients();
    rows = clients.rows;
    totalCount = clients.totalCount;
    truncated = clients.truncated;
    limit = clients.freeRunLimit;
  } catch {
    return (
      <div className="mx-auto w-full max-w-5xl @container">
        <Heading />
        <Callout tone="fail" title="お客様の一覧を取得できませんでした">
          Clerk への接続に失敗しました。時間をおいて開き直してください。
        </Callout>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <Heading />
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        {master ? (
          <>
            登録しているすべてのお客様の契約状況・月額・ご利用状況を確認し、割引・機能の個別開放ができます。金額と契約状況は決済（Stripe）の値をそのまま出しています。
            版・外部連携・定期処理などシステム側の確認は{" "}
            <Link href="/admin" className="text-accent underline">
              マスター画面
            </Link>
            にあります。
          </>
        ) : (
          <>
            登録しているすべてのお客様の契約状況・月額・ご利用状況です。割引の設定・機能の個別開放・
            お客様の画面の確認（代理ログイン）ができます。プランの変更は運用者にご依頼ください。
          </>
        )}
      </p>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-muted">
        <span>
          顧客 <span className="font-bold text-ink tabular-nums">{totalCount}</span> 件
        </span>
        {truncated > 0 && <span>（新しい順に {rows.length} 件を表示）</span>}
      </div>

      <ClientTable initial={rows} freeRunLimit={limit} />
    </div>
  );
}
