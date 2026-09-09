/**
 * ログイン中でない他のユーザーのプランを決める（マスター画面用）。純粋関数。
 *
 * current.ts の getCurrentPlan() と同じ順番にしてある。順番がずれると、
 * マスター画面に出るプランと、その顧客が実際に使えるプランが食い違う。
 *   1. Clerk Billing の契約プラン
 *   2. publicMetadata.plan（運用者が手で割り当てた値）
 *   3. 環境変数 DEFAULT_PLAN
 *   4. free
 *
 * getCurrentPlan() の「認証が無効なら pro」だけは入れない。あれはログイン中の
 * 本人に対する開発用の緩和で、他人のプランの説明にはならないため。
 */
import { toPlanId, type PlanId } from "./catalog";

export type PlanSource = "billing" | "metadata" | "env" | "default";

export interface ResolvedPlan {
  plan: PlanId;
  source: PlanSource;
}

export function resolveUserPlan(input: {
  /** Clerk Billing の契約から引いたプラン（無ければ null） */
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
