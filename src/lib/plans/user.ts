/**
 * ログイン中ではない利用者（Cron が回す相手）のプランと個別開放を引く。サーバー専用。
 *
 * ログイン中の本人は current.ts / guard.ts が判定する。定期処理には「いまのリクエストの本人」が
 * いないので、Clerk の Backend API でその人の publicMetadata を読み、同じ順番（resolve.ts）で決める。
 * 実費の出る自動処理（SerpApi・Places・クロール）を、契約が切れた人のために走らせないための関門。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { isOperatorUser, primaryEmail } from "@/lib/admin/identity";
import { isAgencyMetadata } from "@/lib/admin/roles";
import { isAuthEnabled } from "@/lib/auth/config";
import { findFeatureById } from "@/lib/features/registry";
import { featureAllowed } from "./access";
import type { PlanId } from "./catalog";
import { defaultPlanFromEnv } from "./current";
import { overridesFromMetadata } from "./overrides";
import { resolvePlanFromMetadata } from "./resolve";

export interface UserAccess {
  userId: string;
  plan: PlanId;
  /** 個別開放された機能 ID */
  overrides: string[];
  /** 運用者（ADMIN_EMAILS）なら全機能 */
  admin: boolean;
  /** 管理アカウント（role = agency）ならツールは動かさない（2026-09-23）。古い呼び出し元のために省略可 */
  agency?: boolean;
  /** 連絡先（主メール）。取れなければ null */
  email: string | null;
  /** Clerk から読めなかった（削除済みなど）。このときは何も動かさない */
  missing: boolean;
}

/** 認証が無効な環境（開発・E2E）では全部使える扱い */
const ACCESS_WHEN_AUTH_DISABLED = (userId: string): UserAccess => ({ userId, plan: "premium", overrides: [], admin: false, agency: false, email: null, missing: false });

export async function loadUserAccess(userId: string): Promise<UserAccess> {
  if (!isAuthEnabled()) return ACCESS_WHEN_AUTH_DISABLED(userId);
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata as Record<string, unknown> | undefined;
    const { plan } = resolvePlanFromMetadata(metadata, defaultPlanFromEnv());
    return {
      userId,
      plan,
      overrides: overridesFromMetadata(metadata),
      admin: isOperatorUser(user),
      agency: isAgencyMetadata(metadata),
      email: primaryEmail(user),
      missing: false,
    };
  } catch {
    // 消えた利用者・API の一時的な失敗。開ける方向には倒さない
    return { userId, plan: "free", overrides: [], admin: false, agency: false, email: null, missing: true };
  }
}

/** その機能を使えるか（純粋。判定は plans/access.ts。ログイン中の checkPlanForFeature と同じ関数） */
export function accessAllows(access: UserAccess, featureId: string): boolean {
  if (access.missing) return false;
  return featureAllowed(access, findFeatureById(featureId));
}

export async function canUserUseFeature(userId: string, featureId: string): Promise<boolean> {
  return accessAllows(await loadUserAccess(userId), featureId);
}
