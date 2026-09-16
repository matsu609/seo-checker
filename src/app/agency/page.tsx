import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ClientCards } from "@/components/agency/ClientCards";
import { Callout } from "@/components/ui/Callout";
import { loadAgencyClients } from "@/lib/admin/agencies";
import { currentAgencyId } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "代理店画面",
  description: "担当している登録者の契約状況とご利用状況。",
  // 代理店だけの画面なので、検索にもクローラにも出さない
  robots: { index: false, follow: false },
};

export default async function Page() {
  // 代理店ごとに変わるので、ビルド時に固めない
  await connection();

  // 代理店でなければ「そんな画面は無い」で返す（存在を教えない）
  const agencyId = await currentAgencyId();
  if (!agencyId) notFound();

  let rows;
  try {
    rows = await loadAgencyClients(agencyId);
  } catch {
    return (
      <div className="mx-auto w-full max-w-5xl @container">
        <h1 className="mb-6 flex items-center gap-3 text-xl font-bold text-ink">
          <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
          代理店画面
        </h1>
        <Callout tone="fail" title="登録者の一覧を取得できませんでした">
          Clerk への接続に失敗しました。時間をおいて開き直してください。
        </Callout>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <h1 className="mb-1 flex items-center gap-3 text-xl font-bold text-ink">
        <span className="h-5 w-1 shrink-0 bg-brand" aria-hidden="true" />
        代理店画面
      </h1>
      <p className="mb-6 text-[13px] leading-relaxed text-muted">
        担当としてお預かりしている登録者の契約状況・月額・ご利用状況です。表示だけで、
        プランの変更や機能の開放はできません（運用者にご依頼ください）。
      </p>

      <div className="mb-4 text-[13px] text-muted">
        担当の登録者 <span className="font-bold text-ink tabular-nums">{rows.length}</span> 件
      </div>

      <ClientCards rows={rows} />
    </div>
  );
}
