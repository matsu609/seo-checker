/**
 * POST /api/billing/webhook … Stripe からの通知（ログイン不要。署名で守る。src/lib/auth/routes.ts の PUBLIC_APIS）。
 *
 * 受けるイベント:
 *   checkout.session.completed            … 申し込み完了 → 顧客 ID を結びつけ、サブスクリプションを取って保存
 *   customer.subscription.created/updated/deleted … 契約の変化（更新・支払い遅延・解約）→ 保存
 * 他は 200 で無視する。保存に失敗したら 500 を返して Stripe に再送させる。
 * ユーザーの特定は subscription.metadata.userId（Checkout 作成時に入れている）。
 */
import { isAuthEnabled } from "@/lib/auth/config";
import { checkoutIds, constructWebhookEvent, isStripeConfigured, retrieveSubscription } from "@/lib/billing/stripe";
import { applySubscription, linkStripeCustomer } from "@/lib/billing/sync";
import type Stripe from "stripe";

export const runtime = "nodejs";
export const maxDuration = 30;

function customerIdOf(sub: Stripe.Subscription): string | null {
  return typeof sub.customer === "string" ? sub.customer : (sub.customer?.id ?? null);
}

export async function POST(request: Request) {
  if (!isStripeConfigured() || !isAuthEnabled()) return Response.json({ error: "決済が設定されていません" }, { status: 503 });
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "署名がありません" }, { status: 400 });
  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(await request.text(), signature);
  } catch (err) {
    console.error("[billing] Webhook の署名検証に失敗", err);
    return Response.json({ error: "署名が正しくありません" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const { userId, customerId, subscriptionId } = checkoutIds(event.data.object);
        if (!userId) break;
        if (customerId) await linkStripeCustomer(userId, customerId);
        if (subscriptionId) {
          const sub = await retrieveSubscription(subscriptionId);
          await applySubscription(userId, sub, event.created, customerId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) {
          console.error("[billing] userId の無いサブスクリプション（Checkout 以外で作られた？）", sub.id);
          break;
        }
        await applySubscription(userId, sub, event.created, customerIdOf(sub));
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`[billing] Webhook の処理に失敗（${event.type}）`, err);
    return Response.json({ error: "処理に失敗しました" }, { status: 500 });
  }
  return Response.json({ received: true });
}
