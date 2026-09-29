/**
 * ユーザーの publicMetadata からプランを決める。純粋関数（プランの決まり方の唯一の定義）。
 *
 * ログイン中の本人（current.ts の getCurrentPlan）、定期処理の相手（user.ts の loadUserAccess）、
 * 顧客管理の一覧（admin/clients.ts の buildClientRows）の 3 か所が、どれもここを通る。
 * 順番がずれると、顧客管理に出るプランと、その顧客が実際に使えるプランが食い違うため。
 *   1. Stripe の契約（publicMetadata.stripe。Webhook が書く）
 *   2. publicMetadata.plan（運用者が手で割り当てた値）
 *   3. 環境変数 DEFAULT_PLAN
 *   4. free
 *
 * 1 と 2 の順番が大事。決済を後から有効にしても、手で割り当てた値が決済の判定を上書きしないようにしている。
 *
 * 2026-09-23 に Clerk Billing（has({ plan }) と getUserBillingSubscription）の判定を外した。
 * Clerk Billing はドルにしか対応しておらず使っていない（NEXT_PUBLIC_CLERK_BILLING_ENABLED は未設定、
 * 申し込みの画面も Stripe 直結）ので、どの利用者のプランも変わらない。
 *
 * getCurrentPlan() の「認証が無効ならいちばん上のプラン（premium）」はここには入れない。
 * あれはログイン中の本人に対する開発用の緩和で、他人のプランの説明にはならないため。
 */
import { planFromStripeState, stripeStateFromMetadata } from "@/lib/billing/state";
import { toPlanId, type PlanId } from "./catalog";

/** プランがどこから決まったか。"billing" は Stripe の契約 */
export type PlanSource = "billing" | "metadata" | "env" | "default";

export interface ResolvedPlan {
  plan: PlanId;
  source: PlanSource;
}

export function resolveUserPlan(input: {
  /** Stripe の契約から引いたプラン（無ければ null） */
  billingPlan: PlanId | null;
  /** publicMetadata.plan の生値 */
  metadataPlan: unknown;
  /** 環境変数の既定プラン */
  envDefault: PlanId | null;
}): ResolvedPlan {
  if (input.billingPlan) return { plan: input.billingPlan, source: "billing" };
  const fromMetadata = toPlanId(input.metadataPlan);
  if (fromMetadata) return { plan: fromMetadata, source: "metadata" };
  if (input.envDefault) return { plan: input.envDefault, source: "env" };
  return { plan: "free", source: "default" };
}

/** publicMetadata（読めなければ null）からそのままプランを決める */
export function resolvePlanFromMetadata(metadata: unknown, envDefault: PlanId | null): ResolvedPlan {
  const record = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
  return resolveUserPlan({
    billingPlan: planFromStripeState(stripeStateFromMetadata(record)),
    metadataPlan: record?.plan,
    envDefault,
  });
}
