import type { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { connection } from "next/server";
import { BillingTable } from "@/components/plans/BillingTable";
import { PlanTable } from "@/components/plans/PlanTable";
import { StripeBillingCard } from "@/components/plans/StripeBillingCard";
import { PageHeader } from "@/components/ui";
import { Callout } from "@/components/ui/Callout";
import { isAuthEnabled } from "@/lib/auth/config";
import { STRIPE_CUSTOMER_KEY, stripeStateFromMetadata, type StripeState } from "@/lib/billing/state";
import { isStripeConfigured, isStripeLive } from "@/lib/billing/stripe";
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

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

export default async function Page({ searchParams }: Props) {
  // ログイン中のユーザーごとに変わるので、ビルド時に固めない
  await connection();
  const { plan, source } = await getCurrentPlan();
  const billing = isBillingEnabled();
  // Stripe 直結（円建て）。設定がそろい、ログインしているときだけ出す
  const stripe = isStripeConfigured() && isAuthEnabled();
  let stripeState: StripeState | null = null;
  let hasCustomer = false;
  if (stripe) {
    try {
      const user = await currentUser();
      stripeState = stripeStateFromMetadata(user?.publicMetadata);
      hasCustomer = typeof (user?.privateMetadata as Record<string, unknown> | undefined)?.[STRIPE_CUSTOMER_KEY] === "string";
    } catch {
      // 取れなければ「契約なし」として出す
    }
  }
  const { checkout } = await searchParams;
  const checkoutResult = checkout === "success" ? "success" : checkout === "cancel" ? "cancel" : null;

  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />

      <Callout tone="info" title={`現在のプラン: ${planLabel(plan)}`} className="mb-6">
        {SOURCE_NOTE[source] ?? ""}
      </Callout>

      <PlanTable current={plan} />

      {/* Stripe 直結（円建て）。申し込み・お支払い方法の変更・解約 */}
      {stripe && <StripeBillingCard state={stripeState} hasCustomer={hasCustomer} live={isStripeLive()} checkoutResult={checkoutResult} />}

      {/* Clerk Billing（ドルのみ）。Stripe 直結を使うので通常は出さない */}
      {!stripe && billing && <BillingTable />}

      <p className="mt-6 text-[12px] leading-relaxed text-muted">
        表示は月額（税別）です。
        {!billing && !stripe && "プランの変更をご希望の場合は運用者までご連絡ください。"}
      </p>
    </div>
  );
}
