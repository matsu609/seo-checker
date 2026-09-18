/**
 * POST /api/billing/checkout … 申し込み画面（Stripe Checkout）の URL を返す。
 * 本文: { plan?: "light" | "standard", code?: string }（plan 省略時は本命のスタンダード。code は割引コード。スタンダード専用）。
 * 応答: { url }。画面はこの URL に遷移する。決済が終わると Stripe の Webhook が契約状態を Clerk に書く。
 *
 * プランは必ずここで検証する。買えないプラン（プレミアム = 問い合わせ枠）や Price 未設定のプランを
 * 受け付けると、Checkout が落ちるか、払っていない段階が開いてしまう。
 */
import { currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { impersonationBlockedResponse, isImpersonating } from "@/lib/admin/impersonate";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { PROMO_PLAN, assignedPatternFromMetadata, normalizeCode, resolvePromoCode } from "@/lib/billing/promo";
import { createCheckoutSession, isStripeConfigured, purchasablePlanIds } from "@/lib/billing/stripe";
import { stripeCustomerIdOf } from "@/lib/billing/sync";
import { RECOMMENDED_PLAN, toPlanId } from "@/lib/plans/catalog";

export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  // 代理ログイン中は塞ぐ。運用者がお客様の代わりに申し込んだり解約したりする事故を作らない
  if (await isImpersonating()) return impersonationBlockedResponse();
  if (!isAuthEnabled()) return Response.json({ error: "ログインが設定されていない環境では申し込みできません" }, { status: 503, headers: NO_STORE });
  if (!isStripeConfigured()) return Response.json({ error: "決済が設定されていません", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown; code?: unknown };
  const plan = toPlanId(body.plan) ?? RECOMMENDED_PLAN.id;
  if (!purchasablePlanIds().includes(plan)) {
    return Response.json({ error: "このプランは画面からお申し込みいただけません", code: "not_purchasable" }, { status: 400, headers: NO_STORE });
  }
  const user = await currentUser();
  // 割引: 運用者・代理店が設定したもの（publicMetadata）が最優先。無ければ割引コード（PROMO_CODES）。
  // どちらもスタンダード専用。設定済みの割引はライトの申し込みには黙って付けない（ライトは定価）
  const assigned = assignedPatternFromMetadata(user?.publicMetadata);
  const code = typeof body.code === "string" ? normalizeCode(body.code).slice(0, 64) : "";
  const fromCode = !assigned && code ? resolvePromoCode(code) : null;
  if (!assigned && code && !fromCode) {
    return Response.json({ error: "この割引コードは使えません。コードを外すか、お確かめください", code: "bad_promo" }, { status: 400, headers: NO_STORE });
  }
  if (fromCode && plan !== PROMO_PLAN) {
    return Response.json({ error: "この割引コードはスタンダードプランでのみお使いいただけます", code: "promo_plan" }, { status: 400, headers: NO_STORE });
  }
  const promo = plan === PROMO_PLAN ? (assigned ?? fromCode) : null;
  try {
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const customerId = await stripeCustomerIdOf(userId);
    const url = await createCheckoutSession({ plan, userId, email, customerId, origin: new URL(request.url).origin, promo });
    return Response.json({ url }, { headers: NO_STORE });
  } catch (err) {
    console.error("[billing] Checkout の作成に失敗", err);
    // Stripe が返した理由はそのまま出す（鍵や個人情報は含まない。原因の切り分けに要る）
    const detail = err instanceof Stripe.errors.StripeError ? `Stripe: ${err.message}` : err instanceof Error ? err.message : null;
    return Response.json({ error: "申し込み画面を開けませんでした。しばらくしてからもう一度お試しください", detail }, { status: 502, headers: NO_STORE });
  }
}
