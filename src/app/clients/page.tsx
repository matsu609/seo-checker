/**
 * 顧客管理の画面（サイドバー「管理者用」→「顧客管理」）。
 *
 * 運用者（マスター）と管理アカウントの両方が開く（利用者の決定 2026-09-20）。
 * お客様からお問い合わせ・クレームが来たとき、この 1 画面で完結させるための場所:
 *   ご意見・不具合の一覧と返答 → 契約状況・月額・次回請求 → 登録情報と無料診断の回数 →
 *   割引 → 機能の個別開放 → その方の画面を見る（代理ログイン）
 *
 * 見える範囲は立場で変える。
 *   運用者         … 全登録者。担当の管理アカウントの付け替えもここで行う
 *   管理アカウント … 担当に割り当てられた登録者だけ（担当外は API も 404）
 *
 * システム寄りのもの（版・外部連携・定期処理・管理アカウントの追加）はマスター画面
 * （/admin）に残してある。管理アカウントにはそちらを見せない。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { ClientTable } from "@/components/admin/ClientTable";
import { FeedbackCard } from "@/components/admin/FeedbackCard";
import { Callout } from "@/components/ui/Callout";
import { listAgencyClientIds, loadAgencies, loadAgencyClients, type AgencyRow } from "@/lib/admin/agencies";
import { loadClients, type ClientRow } from "@/lib/admin/clients";
import { currentClientScope } from "@/lib/admin/guard";
import { DbError, isSupabaseConfigured } from "@/lib/db/supabase";
import { listAllFeedback, listFeedbackForUsers } from "@/lib/feedback/store";
import type { FeedbackRecord } from "@/lib/feedback/types";
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
  let agencies: AgencyRow[] = [];
  let totalCount = 0;
  let truncated = 0;
  let limit = freeRunLimit();
  try {
    if (scope.kind === "master") {
      const [clients, list] = await Promise.all([loadClients(), loadAgencies()]);
      rows = clients.rows;
      agencies = list;
      totalCount = clients.totalCount;
      truncated = clients.truncated;
      limit = clients.freeRunLimit;
    } else {
      rows = await loadAgencyClients(scope.agencyId);
      totalCount = rows.length;
    }
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

  // ご意見・不具合（Supabase）。読めなくても画面全体は止めない
  let feedback: FeedbackRecord[] | null = null;
  let feedbackError: string | null = null;
  if (!isSupabaseConfigured()) {
    feedbackError = "保存先（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）が未設定のため、ご意見は表示できません。";
  } else {
    try {
      feedback = master
        ? await listAllFeedback()
        : await listFeedbackForUsers(await listAgencyClientIds(scope.agencyId));
    } catch (err) {
      feedbackError =
        err instanceof DbError && err.status === 404
          ? "feedback テーブルがありません。docs/dev/OPERATIONS.md の SQL（r128）を Supabase の SQL Editor で実行してください。"
          : "ご意見の一覧を取得できませんでした。時間をおいて開き直してください。";
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <Heading />
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        {master ? (
          <>
            登録しているすべてのお客様の契約状況・月額・ご利用状況を確認し、ご意見への返答・割引・機能の個別開放・
            担当の管理アカウントの割り当てができます。金額と契約状況は決済（Stripe）の値をそのまま出しています。
            版・外部連携・定期処理などシステム側の確認は{" "}
            <Link href="/admin" className="text-accent underline">
              マスター画面
            </Link>
            にあります。
          </>
        ) : (
          <>
            担当としてお預かりしているお客様の契約状況・月額・ご利用状況です。ご意見への返答・割引の設定・
            機能の個別開放・お客様の画面の確認（代理ログイン）ができます。プランの変更と担当の割り当ては
            運用者にご依頼ください。
          </>
        )}
      </p>

      <div className="mb-6">
        <FeedbackCard initial={feedback} loadError={feedbackError} />
      </div>

      <div className="mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px] text-muted">
        <span>
          {master ? "顧客" : "担当のお客様"}{" "}
          <span className="font-bold text-ink tabular-nums">{totalCount}</span> 件
        </span>
        {truncated > 0 && <span>（新しい順に {rows.length} 件を表示）</span>}
      </div>

      <ClientTable
        initial={rows}
        agencies={agencies}
        freeRunLimit={limit}
        canAssign={master}
        emptyTitle={master ? "まだ顧客がいません" : "担当のお客様がまだいません"}
        emptyDescription={
          master
            ? "ログインしたアカウントがここに並びます。"
            : "お客様が登録したあと、運用者が担当としてお客様をこの画面に割り当てます。お心当たりのあるお客様が出てこない場合は、運用者にお知らせください。"
        }
      />
    </div>
  );
}
