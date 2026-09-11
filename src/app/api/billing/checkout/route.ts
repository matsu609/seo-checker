/**
 * POST /api/billing/checkout … オールインワンの申し込み画面（Stripe Checkout）の URL を返す。
 * 応答: { url }。画面はこの URL に遷移する。決済が終わると Stripe の Webhook が契約状態を Clerk に書く。
 */
import { currentUser } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { createCheckoutSession, isStripeConfigured } from "@/lib/billing/stripe";
import { stripeCustomerIdOf } from "@/lib/billing/sync";

export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isAuthEnabled()) return Response.json({ error: "ログインが設定されていない環境では申し込みできません" }, { status: 503, headers: NO_STORE });
  if (!isStripeConfigured()) return Response.json({ error: "決済が設定されていません", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  try {
    const user = await currentUser();
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const customerId = await stripeCustomerIdOf(userId);
    const url = await createCheckoutSession({ userId, email, customerId, origin: new URL(request.url).origin });
    return Response.json({ url }, { headers: NO_STORE });
  } catch (err) {
    console.error("[billing] Checkout の作成に失敗", err);
    return Response.json({ error: "申し込み画面を開けませんでした。しばらくしてからもう一度お試しください" }, { status: 502, headers: NO_STORE });
  }
}
