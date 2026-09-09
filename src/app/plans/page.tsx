import type { Metadata } from "next";
import { connection } from "next/server";
import { BillingTable } from "@/components/plans/BillingTable";
import { PlanTable } from "@/components/plans/PlanTable";
import { PageHeader } from "@/components/ui";
import { Callout } from "@/components/ui/Callout";
import { requireFeature } from "@/lib/features/registry";
import { isBillingEnabled } from "@/lib/plans/billing";
import { planLabel } from "@/lib/plans/catalog";
import { getCurrentPlan } from "@/lib/plans/current";

const feature = requireFeature("plans");

export const metadata: Metadata = { title: feature.label, description: feature.description };

/** どこからプランが決まったかの説明（運用者向け） */
const SOURCE_NOTE: Record<string, string> = {
  "auth-disabled": "ログインが設定されていないため、すべての機能が開いています（開発・検証用の状態です）。",
  billing: "ご契約中のプランです。",
  metadata: "運用者が割り当てたプランです。",
  env: "サーバーの既定プラン（DEFAULT_PLAN）が適用されています。",
  default: "プランが割り当てられていないため、無料診断のみご利用いただけます。",
};

export default async function Page() {
  // ログイン中のユーザーごとに変わるので、ビルド時に固めない
  await connection();
  const { plan, source } = await getCurrentPlan();
  const billing = isBillingEnabled();

  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />

      <Callout tone="info" title={`現在のプラン: ${planLabel(plan)}`} className="mb-6">
        {SOURCE_NOTE[source] ?? ""}
      </Callout>

      <PlanTable current={plan} />

      {/* Clerk Billing を有効にしていれば、ここから購入・変更できる */}
      {billing && <BillingTable />}

      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        表示は月額（税別）です。
        {!billing && "プランの変更をご希望の場合は運用者までご連絡ください。"}
      </p>
    </div>
  );
}
