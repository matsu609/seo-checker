/**
 * ログイン中ではない利用者（Cron が回す相手）のプランと個別開放を引く。サーバー専用。
 *
 * ログイン中の本人は current.ts / guard.ts が判定する。定期処理には「いまのリクエストの本人」が
 * いないので、Clerk の Backend API でその人の publicMetadata を読み、同じ順番（resolve.ts）で決める。
 * 実費の出る自動処理（SerpApi・Places・クロール）を、契約が切れた人のために走らせないための関門。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { isAdminEmail, adminEmails } from "@/lib/admin/config";
import { isAuthEnabled } from "@/lib/auth/config";
import { planFromStripeState, stripeStateFromMetadata } from "@/lib/billing/state";
import { findFeatureById } from "@/lib/features/registry";
import { planAllows, type PlanId } from "./catalog";
import { defaultPlanFromEnv } from "./current";
import { overridesFromMetadata } from "./overrides";
import { resolveUserPlan } from "./resolve";

export interface UserAccess {
  userId: string;
  plan: PlanId;
  /** 個別開放された機能 ID */
  overrides: string[];
  /** 運用者（ADMIN_EMAILS）なら全機能 */
  admin: boolean;
  /** 連絡先（確認済みの主メール）。取れなければ null */
  email: string | null;
  /** Clerk から読めなかった（削除済みなど）。このときは何も動かさない */
  missing: boolean;
}

/** 認証が無効な環境（開発・E2E）では全部使える扱い */
const ACCESS_WHEN_AUTH_DISABLED = (userId: string): UserAccess => ({ userId, plan: "premium", overrides: [], admin: false, email: null, missing: false });

export async function loadUserAccess(userId: string): Promise<UserAccess> {
  if (!isAuthEnabled()) return ACCESS_WHEN_AUTH_DISABLED(userId);
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const metadata = user.publicMetadata as Record<string, unknown> | undefined;
    const stripe = stripeStateFromMetadata(metadata);
    const { plan } = resolveUserPlan({
      billingPlan: stripe ? planFromStripeState(stripe) : null,
      metadataPlan: metadata?.plan,
      envDefault: defaultPlanFromEnv(),
    });
    const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId) ?? user.emailAddresses[0];
    const allowed = adminEmails();
    const admin = user.emailAddresses.some((e) => e.verification?.status === "verified" && isAdminEmail(e.emailAddress, allowed));
    return { userId, plan, overrides: overridesFromMetadata(metadata), admin, email: primary?.emailAddress ?? null, missing: false };
  } catch {
    // 消えた利用者・API の一時的な失敗。開ける方向には倒さない
    return { userId, plan: "free", overrides: [], admin: false, email: null, missing: true };
  }
}

/** その機能を使えるか（純粋。guard.ts の checkPlanForFeature と同じ判定） */
export function accessAllows(access: UserAccess, featureId: string): boolean {
  if (access.missing) return false;
  const feature = findFeatureById(featureId);
  if (!feature) return true;
  if (planAllows(access.plan, feature.plan)) return true;
  // 運用者は全機能（ログイン中の判定 checkPlanForFeature と同じ）
  if (access.admin) return true;
  return access.overrides.includes(featureId);
}

export async function canUserUseFeature(userId: string, featureId: string): Promise<boolean> {
  return accessAllows(await loadUserAccess(userId), featureId);
}
