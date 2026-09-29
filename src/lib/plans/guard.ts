/**
 * 料金プランによるゲート。サーバー専用。
 *
 * 必要なプランは機能レジストリ（src/lib/features/registry.ts）が持つ。
 * API ルート側でプラン名を書き写すと必ずずれるので、機能 ID から引く。
 *
 * 判定そのものは plans/access.ts の decideFeatureAccess（定期処理の accessAllows・画面の canUseFeature と同じ関数）。
 * ここはログイン中の本人の「立場」（プラン・個別開放・運用者か・管理アカウントか）を集めるだけ。
 * 立場は Clerk のユーザー 1 回の読み込みからまとめて作る（2026-09-23。以前はプラン・運用者・個別開放を
 * 別々に読み、足りないときは 1 リクエストで最大 3 回 Clerk に問い合わせていた）。
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { isOperatorUser } from "@/lib/admin/identity";
import { isAgencyMetadata } from "@/lib/admin/roles";
import { isAuthEnabled } from "@/lib/auth/config";
import { findFeatureById } from "@/lib/features/registry";
import { decideFeatureAccess, type AccessDenialReason, type AccessSubject } from "./access";
import { PLAN_BY_ID, RECOMMENDED_PLAN, planAllows, planLabel, planPriceLabel, upgradeTarget, type PlanId } from "./catalog";
import { currentPlanFromMetadata, PLAN_WHEN_AUTH_DISABLED } from "./current";
import { overridesFromMetadata } from "./overrides";

export interface PlanDenial {
  required: PlanId;
  current: PlanId;
  message: string;
  /** plan = プランが足りない / manager = 管理アカウントなのでツールを使わない */
  reason: AccessDenialReason;
}

/** 管理アカウントに出す断りの文面（ツールはお客様の画面を代理ログインで確かめる） */
export const MANAGER_DENIAL_MESSAGE =
  "管理アカウントではツールをご利用いただけません。お客様の画面の見え方は、顧客管理の「この方の画面を見る」でご確認ください。";

/**
 * 断りの文面。いちばん安く使えるプランを先に言い、それが本命でなければ本命も並べる。
 * 3 段階にした意味（どれを買うかで比べていただく）がここで消えないようにする。
 */
export function denialMessage(required: PlanId, current: PlanId): string {
  const target = upgradeTarget(required);
  const alsoRecommended =
    target.id === RECOMMENDED_PLAN.id
      ? ""
      : `AI が改修案・FAQ まで作る「${RECOMMENDED_PLAN.label}」（${planPriceLabel(RECOMMENDED_PLAN.id)}）もございます。`;
  return (
    `この機能は「${target.label}」（${planPriceLabel(target.id)}）からご利用いただけます。` +
    alsoRecommended +
    `現在のプランは「${planLabel(current)}」です。`
  );
}

/**
 * ログイン中の本人の立場。Clerk のユーザーを 1 回だけ読んで作る。
 *
 *   認証が無効（開発・E2E）… いちばん上のプラン。運用者・管理アカウントではない
 *   未ログイン              … free
 *   読めなかった            … プランは DEFAULT_PLAN → free。運用者・管理アカウント・個別開放は無し（開ける方向には倒さない）
 */
export async function currentAccessSubject(): Promise<AccessSubject> {
  if (!isAuthEnabled()) return { plan: PLAN_WHEN_AUTH_DISABLED, overrides: [], admin: false, agency: false };
  const { userId } = await auth();
  if (!userId) return { plan: "free", overrides: [], admin: false, agency: false };
  try {
    const user = await currentUser();
    const metadata = user?.publicMetadata ?? null;
    return {
      plan: currentPlanFromMetadata(metadata).plan,
      overrides: overridesFromMetadata(metadata),
      admin: user ? isOperatorUser(user) : false,
      agency: isAgencyMetadata(metadata),
    };
  } catch {
    return { plan: currentPlanFromMetadata(null).plan, overrides: [], admin: false, agency: false };
  }
}

/** プランが足りているか調べる（機能 ID を持たない呼び出し用）。足りていれば null */
export async function checkPlan(required: PlanId): Promise<PlanDenial | null> {
  const { plan } = await currentAccessSubject();
  if (planAllows(plan, required)) return null;
  return { required, current: plan, message: denialMessage(required, plan), reason: "plan" };
}

/**
 * ログイン中のユーザーに個別開放されている機能 ID。
 * 運用者・管理アカウントが顧客管理で付けた分だけで、既定は空。
 */
export async function featureOverrides(): Promise<string[]> {
  try {
    const { userId } = await auth();
    if (!userId) return [];
    const user = await currentUser();
    return overridesFromMetadata(user?.publicMetadata);
  } catch {
    // 取れなければ開放なし（開ける方向には倒さない）
    return [];
  }
}

/** 機能 ID から必要プランを引いて調べる。使えれば null */
export async function checkPlanForFeature(featureId: string): Promise<PlanDenial | null> {
  const feature = findFeatureById(featureId);
  // 知らない機能は塞がない（レジストリに無いものはゲートの対象外）
  if (!feature) return null;
  const subject = await currentAccessSubject();
  const decision = decideFeatureAccess(subject, feature);
  if (decision.ok) return null;
  return {
    required: feature.plan,
    current: subject.plan,
    reason: decision.reason,
    message: decision.reason === "manager" ? MANAGER_DENIAL_MESSAGE : denialMessage(feature.plan, subject.plan),
  };
}

/**
 * API ルート用。使えなければ Response を返す。
 *   プランが足りない → 402 Payment Required（画面が「アップグレードのご案内」を出す。401 / 403 と区別するため）
 *   管理アカウント   → 403（買えば使えるわけではないので 402 にしない）
 */
export async function requirePlanForFeature(featureId: string): Promise<Response | null> {
  const denial = await checkPlanForFeature(featureId);
  if (!denial) return null;
  if (denial.reason === "manager") {
    return Response.json({ error: denial.message, code: "manager_account" }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  return Response.json(
    {
      error: denial.message,
      code: "plan_required",
      requiredPlan: denial.required,
      currentPlan: denial.current,
      priceYen: PLAN_BY_ID[denial.required].priceYen,
    },
    { status: 402, headers: { "cache-control": "no-store" } },
  );
}
