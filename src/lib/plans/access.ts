/**
 * 「この人はこの機能を使えるか」の判定そのもの。純粋関数だけを置く（クライアントからも読める）。
 *
 * 2026-09-23 まで、同じ判定が 3 か所に別々に書かれていた:
 *   - `checkPlanForFeature`（plans/guard.ts。ログイン中の API と PlanGate）
 *   - `accessAllows`（plans/user.ts。定期処理）
 *   - `canUseFeature`（store/usePlan.ts。サイドバーの鍵表示。順位の比べ方まで自前だった）
 * 1 か所だけ直すと「画面では開いているのに API が 402」「定期処理だけ動く」が起きるので、
 * 3 か所ともここを呼ぶ形にした。判定の順番を変えるときはここだけを直す。
 *
 * 判定の順番:
 *   1. レジストリに無い機能 … 塞がない（ゲートの対象外）
 *   2. 運用者（ADMIN_EMAILS の確認済みメール）… 全機能。本番の DEFAULT_PLAN が free でも確認作業が止まらないように
 *   3. 管理アカウント（publicMetadata.role = agency）… ツールは使わない立場なので、無料の画面（free / 料金 / 設定）以外は開かない。
 *      2026-09-21 に画面（AppShell / Sidebar）からは消していたが、API は本人のプランで判定していたため
 *      URL を直接叩けば使えた。サーバーでも同じ線を引く（2026-09-23）
 *   4. プランが足りている
 *   5. 運用者・管理アカウントが個別開放した
 */
import { planAllows, type PlanId } from "./catalog";

/** 判定に要る「その人の立場」。どこから読んだか（セッション / Clerk の Backend API / /api/plan）は問わない */
export interface AccessSubject {
  plan: PlanId;
  /** 個別開放された機能 ID */
  overrides: readonly string[];
  /** 運用者（ADMIN_EMAILS の確認済みメール） */
  admin: boolean;
  /** 管理アカウント（publicMetadata.role = agency）。古い呼び出し元のために省略可（省略 = false） */
  agency?: boolean;
}

/** 判定に要る機能の情報（registry の Feature の一部） */
export interface GatedFeature {
  id: string;
  plan: PlanId;
}

/**
 * 断った理由。
 *   plan    … プランが足りない（アップグレードの案内を出す）
 *   manager … 管理アカウントなのでツールを使わない（代理ログインで確かめるよう案内する）
 */
export type AccessDenialReason = "plan" | "manager";

export type AccessDecision = { ok: true } | { ok: false; reason: AccessDenialReason };

const OK: AccessDecision = { ok: true };

export function decideFeatureAccess(subject: AccessSubject, feature: GatedFeature | null): AccessDecision {
  if (!feature) return OK;
  if (subject.admin) return OK;
  if (subject.agency) return feature.plan === "free" ? OK : { ok: false, reason: "manager" };
  if (planAllows(subject.plan, feature.plan)) return OK;
  if (subject.overrides.includes(feature.id)) return OK;
  return { ok: false, reason: "plan" };
}

/** 使えるかどうかだけ知りたいとき */
export function featureAllowed(subject: AccessSubject, feature: GatedFeature | null): boolean {
  return decideFeatureAccess(subject, feature).ok;
}
