/**
 * ログイン中のユーザーのプランを決める。サーバー専用。
 *
 * 判定の順番:
 *   1. 認証が無効（開発・E2E）… いちばん上のプラン扱い。今までどおり全部使える
 *   2. Clerk Billing の has({ plan }) … 決済を有効にしたらこれが効く
 *   3. Clerk の publicMetadata.plan … 決済を入れる前に、運用者がダッシュボードで割り当てる
 *   4. 環境変数 DEFAULT_PLAN … 単一テナント運用でまとめて開けたいとき
 *   5. どれも無ければ free
 *
 * 2 と 3 の順番が大事。決済を後から有効にしても、手で割り当てた値が
 * 決済の判定を上書きしてしまわないようにしている。
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { PLANS, PLAN_RANK, toPlanId, type PlanId } from "./catalog";

/** 環境変数で指定した既定プラン（未設定・不正な値なら null） */
export function defaultPlanFromEnv(): PlanId | null {
  return toPlanId(process.env.DEFAULT_PLAN);
}

/** 認証が無効なときに使うプラン。開発と E2E で全機能を開けたままにする */
const PLAN_WHEN_AUTH_DISABLED: PlanId = "pro";

export interface CurrentPlan {
  plan: PlanId;
  /** どこから決まったか（設定画面と料金画面に出す） */
  source: "auth-disabled" | "billing" | "metadata" | "env" | "default";
}

export async function getCurrentPlan(): Promise<CurrentPlan> {
  if (!isAuthEnabled()) {
    return { plan: PLAN_WHEN_AUTH_DISABLED, source: "auth-disabled" };
  }

  const { userId, has } = await auth();
  if (!userId) return { plan: "free", source: "default" };

  // 1. Clerk Billing。上位のプランから順に見て、最初に当たったものを採る
  try {
    for (const plan of [...PLANS].sort((a, b) => PLAN_RANK[b.id] - PLAN_RANK[a.id])) {
      if (plan.id !== "free" && has({ plan: plan.clerkPlan })) {
        return { plan: plan.id, source: "billing" };
      }
    }
  } catch {
    // Billing が未設定のときは has() が投げることがある。次の手段へ落ちる
  }

  // 2. 運用者が Clerk ダッシュボードで割り当てた値
  try {
    const user = await currentUser();
    const fromMetadata = toPlanId((user?.publicMetadata as Record<string, unknown>)?.plan);
    if (fromMetadata) return { plan: fromMetadata, source: "metadata" };
  } catch {
    // ユーザーを取れなくても既定に落ちるだけ
  }

  const fromEnv = defaultPlanFromEnv();
  if (fromEnv) return { plan: fromEnv, source: "env" };

  return { plan: "free", source: "default" };
}
