/**
 * POST /api/billing/checkout … 申し込み画面（Stripe Checkout）の URL を返す。
 * 本文: { plan?: "light" | "standard", code?: string }（plan 省略時は本命のスタンダード。code は割引コード。スタンダード専用）。
 * 応答: { url }。画面はこの URL に遷移する。決済が終わると Stripe の Webhook が契約状態を Clerk に書く。
 *
 * プランは必ずここで検証する。買えないプラン（プレミアム = 問い合わせ枠）や Price 未設定のプランを
 * 受け付けると、Checkout が落ちるか、払っていない段階が開いてしまう。
 *
 * すでに契約がある人（有効・トライアル・支払い遅延・未払い・一時停止）には申し込み画面を作らず 409 を返す
 * （2026-09-23）。作ると 2 本目のサブスクリプションができて二重に請求される。プランの変更・解約は
 * カスタマーポータル（/api/billing/portal）で行う。
 */
import { currentUser } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { z } from "zod";
import { impersonationBlockedResponse, isImpersonating } from "@/lib/admin/impersonate";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { PROMO_PLAN, assignedPatternFromMetadata, normalizeCode, resolvePromoCode } from "@/lib/billing/promo";
import { hasStripeSubscription, stripeStateFromMetadata } from "@/lib/billing/state";
import { promoLimitResponse, takePromoAttempt } from "@/lib/billing/promo-limit";
import { createCheckoutSession, isStripeConfigured, purchasablePlanIds } from "@/lib/billing/stripe";
import { stripeCustomerIdOf } from "@/lib/billing/sync";
import { RECOMMENDED_PLAN, toPlanId } from "@/lib/plans/catalog";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * 本文の形（2026-09-23 に zod で検証するようにした。null を送ると body.plan で落ちて 500 になっていた）。
 * 本文が無い・JSON でないときは「プラン省略」として本命で申し込む（今までどおり）。
 */
const BodySchema = z.object({
  plan: z.string().max(40).optional(),
  code: z.string().max(200).optional(),
});

/** 契約済みの人への案内。料金画面の「お申し込み・お支払い」の文言（StripeBillingCard）にそろえる */
const ALREADY_SUBSCRIBED_MESSAGE =
  "すでにご契約中です。プランの変更（ライト ⇄ スタンダード）と解約は、料金プランの画面の「お支払い方法の変更・プランの変更・請求書・解約」から開く Stripe の画面で行えます。";

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  // 認証が無効な環境では先に断る（Clerk のミドルウェアが無いまま代理ログインの判定を呼ぶと 500 になるため）
  if (!isAuthEnabled()) return Response.json({ error: "ログインが設定されていない環境では申し込みできません" }, { status: 503, headers: NO_STORE });
  // 代理ログイン中は塞ぐ。運用者がお客様の代わりに申し込んだり解約したりする事故を作らない
  if (await isImpersonating()) return impersonationBlockedResponse();
  if (!isStripeConfigured()) return Response.json({ error: "決済が設定されていません", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "入力が正しくありません", code: "bad_request" }, { status: 400, headers: NO_STORE });
  const body = parsed.data;
  // 知らないプラン名を黙って本命に読み替えない（押したボタンと違うプランで申し込み画面が開いてしまう）
  const plan = body.plan === undefined ? RECOMMENDED_PLAN.id : toPlanId(body.plan);
  if (!plan || !purchasablePlanIds().includes(plan)) {
    return Response.json({ error: "このプランは画面からお申し込みいただけません", code: "not_purchasable" }, { status: 400, headers: NO_STORE });
  }
  const user = await currentUser();
  // すでに契約がある人に 2 本目を作らない（二重請求になる）。変更はポータルで
  if (hasStripeSubscription(stripeStateFromMetadata(user?.publicMetadata))) {
    return Response.json({ error: ALREADY_SUBSCRIBED_MESSAGE, code: "already_subscribed" }, { status: 409, headers: NO_STORE });
  }
  // 割引: 運用者・代理店が設定したもの（publicMetadata）が最優先。無ければ割引コード（PROMO_CODES）。
  // どちらもスタンダード専用。設定済みの割引はライトの申し込みには黙って付けない（ライトは定価）
  const assigned = assignedPatternFromMetadata(user?.publicMetadata);
  const code = body.code ? normalizeCode(body.code).slice(0, 64) : "";
  // コードを確かめるときは確認の API（/api/billing/promo）と同じ枠を 1 回ぶん使う（総当たりを止める。2026-09-23）
  if (!assigned && code && !takePromoAttempt(userId)) return promoLimitResponse();
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
