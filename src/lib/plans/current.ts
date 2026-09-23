/**
 * ログイン中のユーザーのプランを決める。サーバー専用。
 *
 * 判定の順番:
 *   1. 認証が無効（開発・E2E）… いちばん上のプラン（premium）扱い。今までどおり全部使える
 *   2. それ以外は resolve.ts の resolvePlanFromMetadata（Stripe の契約 → publicMetadata.plan →
 *      環境変数 DEFAULT_PLAN → free）。定期処理（user.ts）と顧客管理（admin/clients.ts）も同じ関数を通る
 *
 * 2026-09-23 に Clerk Billing の has({ plan }) を見る段を外した（resolve.ts の冒頭に理由）。
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { toPlanId, type PlanId } from "./catalog";
import { resolvePlanFromMetadata, type PlanSource } from "./resolve";

/** 環境変数で指定した既定プラン（未設定・不正な値なら null） */
export function defaultPlanFromEnv(): PlanId | null {
  return toPlanId(process.env.DEFAULT_PLAN);
}

/** 認証が無効なときに使うプラン。開発と E2E で全機能を開けたままにする（いちばん上の段） */
export const PLAN_WHEN_AUTH_DISABLED: PlanId = "premium";

export interface CurrentPlan {
  plan: PlanId;
  /** どこから決まったか（設定画面と料金画面に出す） */
  source: "auth-disabled" | PlanSource;
}

/** 読み込んだ publicMetadata（読めなければ null）からログイン中の本人のプランを決める（1 回の読み込みで済ませたいとき用） */
export function currentPlanFromMetadata(metadata: unknown): CurrentPlan {
  return resolvePlanFromMetadata(metadata, defaultPlanFromEnv());
}

export async function getCurrentPlan(): Promise<CurrentPlan> {
  if (!isAuthEnabled()) {
    return { plan: PLAN_WHEN_AUTH_DISABLED, source: "auth-disabled" };
  }

  const { userId } = await auth();
  if (!userId) return { plan: "free", source: "default" };

  let metadata: unknown = null;
  try {
    const user = await currentUser();
    metadata = user?.publicMetadata ?? null;
  } catch {
    // ユーザーを取れなくても既定（DEFAULT_PLAN → free）に落ちるだけ
  }
  return currentPlanFromMetadata(metadata);
}
