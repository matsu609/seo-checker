/**
 * POST /api/billing/portal … お支払い方法の変更・請求書・解約（Stripe カスタマーポータル）の URL を返す。
 * 応答: { url }。Stripe の顧客がまだ無い（申し込んでいない）ユーザーには 404。
 */
import { isAuthEnabled } from "@/lib/auth/config";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { createPortalSession, isStripeConfigured } from "@/lib/billing/stripe";
import { stripeCustomerIdOf } from "@/lib/billing/sync";

export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isAuthEnabled()) return Response.json({ error: "ログインが設定されていない環境では使えません" }, { status: 503, headers: NO_STORE });
  if (!isStripeConfigured()) return Response.json({ error: "決済が設定されていません", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  try {
    const customerId = await stripeCustomerIdOf(userId);
    if (!customerId) return Response.json({ error: "お支払い情報がまだありません。先にお申し込みください" }, { status: 404, headers: NO_STORE });
    const url = await createPortalSession(customerId, new URL(request.url).origin);
    return Response.json({ url }, { headers: NO_STORE });
  } catch (err) {
    console.error("[billing] カスタマーポータルの作成に失敗", err);
    return Response.json({ error: "お支払いの管理画面を開けませんでした。しばらくしてからもう一度お試しください" }, { status: 502, headers: NO_STORE });
  }
}
