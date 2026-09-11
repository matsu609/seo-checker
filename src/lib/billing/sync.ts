/**
 * Stripe の契約状態を Clerk のユーザーに書く（Webhook から呼ぶ）。サーバー専用。
 *
 * publicMetadata.stripe … 契約状態（state.ts の形。プラン判定と画面に使う）
 * privateMetadata.stripeCustomerId … Stripe の顧客 ID（ポータルを開くときに使う）
 * publicMetadata は丸ごと置き換わるので、他のキー（plan、featureOverrides）を必ず残す。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { shouldApplyEvent, stateFromSubscription, STRIPE_CUSTOMER_KEY, STRIPE_STATE_KEY, stripeStateFromMetadata, type StripeState, type SubscriptionLike } from "./state";

async function loadUser(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return { client, user, publicMetadata: (user.publicMetadata ?? {}) as Record<string, unknown>, privateMetadata: (user.privateMetadata ?? {}) as Record<string, unknown> };
}

/** 顧客 ID を結びつける（既に同じなら何もしない） */
export async function linkStripeCustomer(userId: string, customerId: string): Promise<void> {
  const { client, privateMetadata } = await loadUser(userId);
  if (privateMetadata[STRIPE_CUSTOMER_KEY] === customerId) return;
  await client.users.updateUserMetadata(userId, { privateMetadata: { ...privateMetadata, [STRIPE_CUSTOMER_KEY]: customerId } });
}

/** ログイン中のユーザーの Stripe の顧客 ID（無ければ null） */
export async function stripeCustomerIdOf(userId: string): Promise<string | null> {
  const { privateMetadata } = await loadUser(userId);
  const id = privateMetadata[STRIPE_CUSTOMER_KEY];
  return typeof id === "string" && id ? id : null;
}

/**
 * サブスクリプションの状態を保存する。古いイベントなら何もしない（false）。
 * customerId を渡せば顧客 ID も同時に結びつける。
 */
export async function applySubscription(userId: string, sub: SubscriptionLike, eventCreated: number, customerId: string | null = null): Promise<StripeState | false> {
  const { client, publicMetadata, privateMetadata } = await loadUser(userId);
  const current = stripeStateFromMetadata(publicMetadata);
  if (!shouldApplyEvent(current, eventCreated)) return false;
  const next = stateFromSubscription(sub, eventCreated);
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { ...publicMetadata, [STRIPE_STATE_KEY]: next },
    ...(customerId && privateMetadata[STRIPE_CUSTOMER_KEY] !== customerId ? { privateMetadata: { ...privateMetadata, [STRIPE_CUSTOMER_KEY]: customerId } } : {}),
  });
  return next;
}
