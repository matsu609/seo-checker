/**
 * 料金プランによるゲート。サーバー専用。
 *
 * 必要なプランは機能レジストリ（src/lib/features/registry.ts）が持つ。
 * API ルート側でプラン名を書き写すと必ずずれるので、機能 ID から引く。
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { isAdmin, isAgency } from "@/lib/admin/guard";
import { findFeatureById } from "@/lib/features/registry";
import { PLAN_BY_ID, RECOMMENDED_PLAN, planAllows, planLabel, planPriceLabel, upgradeTarget, type PlanId } from "./catalog";
import { getCurrentPlan } from "./current";
import { overridesFromMetadata } from "./overrides";

export interface PlanDenial {
  required: PlanId;
  current: PlanId;
  message: string;
}

/** プランが足りているか調べる。足りていれば null */
export async function checkPlan(required: PlanId): Promise<PlanDenial | null> {
  const { plan } = await getCurrentPlan();
  if (planAllows(plan, required)) return null;
  return { required, current: plan, message: denialMessage(required, plan) };
}

/**
 * 断りの文面。いちばん安く使えるプランを先に言い、それが本命でなければ本命も並べる。
 * 3 段階にした意味（どれを買うかで比べていただく）がここで消えないようにする。
 */
export function denialMessage(required: PlanId, current: PlanId): string {
  const target = upgradeTarget(required);
  const alsoRecommended =
    target.id === RECOMMENDED_PLAN.id
      ? ""
      : `AI が改修案・原稿まで作る「${RECOMMENDED_PLAN.label}」（${planPriceLabel(RECOMMENDED_PLAN.id)}）もございます。`;
  return (
    `この機能は「${target.label}」（${planPriceLabel(target.id)}）からご利用いただけます。` +
    alsoRecommended +
    `現在のプランは「${planLabel(current)}」です。`
  );
}

/**
 * ログイン中のユーザーに個別開放されている機能 ID。
 * 運用者がマスター画面で付けた分だけで、既定は空。
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

/**
 * 機能 ID から必要プランを引いて調べる。
 * プランで足りないときだけ個別開放を見に行く（足りている場合の往復を増やさない）。
 */
export async function checkPlanForFeature(featureId: string): Promise<PlanDenial | null> {
  const feature = findFeatureById(featureId);
  // 知らない機能は塞がない（レジストリに無いものはゲートの対象外）
  if (!feature) return null;
  const denial = await checkPlan(feature.plan);
  if (!denial) return null;
  // 運用者（ADMIN_EMAILS）と管理アカウント（publicMetadata.role = agency）は全ツールを使える。
  // 運用者は本番の DEFAULT_PLAN を free にしたあと（2026-09-18）も確認作業が止まらないように。
  // 管理アカウントは、お客様の問い合わせにその場で答えられるよう、カードの登録なしで
  // 同じ画面を触れるようにする（利用者の決定 2026-09-20）。契約状況の表示は変えない
  if (await isAdmin()) return null;
  if (await isAgency()) return null;
  const overrides = await featureOverrides();
  return overrides.includes(featureId) ? null : denial;
}

/**
 * API ルート用。プランが足りなければ 402 の Response を返す。
 * 402 Payment Required にしているのは、401（未ログイン）や 403（権限）と
 * 画面側で区別して「アップグレードのご案内」を出すため。
 */
export async function requirePlanForFeature(featureId: string): Promise<Response | null> {
  const denial = await checkPlanForFeature(featureId);
  if (!denial) return null;
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
