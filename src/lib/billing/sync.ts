/**
 * Stripe の契約状態を Clerk のユーザーに書く（Webhook から呼ぶ）。サーバー専用。
 *
 * publicMetadata.stripe … 契約状態（state.ts の形。プラン判定と画面に使う）
 * privateMetadata.stripeCustomerId … Stripe の顧客 ID（ポータルを開くときに使う）
 *
 * 書き込みは Clerk の updateUserMetadata で、これは**深いマージ**（渡したキーだけが変わり、他のキーは残る）。
 * 2026-09-23 まで読み込んだ publicMetadata / privateMetadata を丸ごと送り直していたため、
 * 読んでから書くまでの間に別の書き込み（顧客管理の個別開放・無料診断の回数など）があると、それを古い値で
 * 巻き戻していた。いまは変えるキーだけを送る。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { planForPriceId, priceIdOf, retrieveSubscription } from "./stripe";
import {
  decideSubscriptionEvent,
  planForSubscription,
  stateFromSubscription,
  STRIPE_CUSTOMER_KEY,
  STRIPE_STATE_KEY,
  stripeStateFromMetadata,
  type StripeState,
  type SubscriptionLike,
} from "./state";

async function loadUser(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return { client, user, publicMetadata: (user.publicMetadata ?? {}) as Record<string, unknown>, privateMetadata: (user.privateMetadata ?? {}) as Record<string, unknown> };
}

/** 顧客 ID を結びつける（既に同じなら何もしない） */
export async function linkStripeCustomer(userId: string, customerId: string): Promise<void> {
  const { client, privateMetadata } = await loadUser(userId);
  if (privateMetadata[STRIPE_CUSTOMER_KEY] === customerId) return;
  await client.users.updateUserMetadata(userId, { privateMetadata: { [STRIPE_CUSTOMER_KEY]: customerId } });
}

/** ログイン中のユーザーの Stripe の顧客 ID（無ければ null） */
export async function stripeCustomerIdOf(userId: string): Promise<string | null> {
  const { privateMetadata } = await loadUser(userId);
  const id = privateMetadata[STRIPE_CUSTOMER_KEY];
  return typeof id === "string" && id ? id : null;
}

/** Stripe 上でまだ請求が続いている（= 生きている）契約の状態 */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * 保存中の契約が Stripe 上でまだ生きているか。別の契約のイベントが来たときだけ呼ぶ（ふだんは API を呼ばない）。
 * 見つからない契約は「生きていない」。通信の失敗は投げる（Webhook が 500 を返し、Stripe が送り直す）。
 */
export async function isSubscriptionAlive(subscriptionId: string): Promise<boolean> {
  try {
    const sub = await retrieveSubscription(subscriptionId);
    return LIVE_STATUSES.has(sub.status);
  } catch (err) {
    if (err && typeof err === "object" && (err as { code?: unknown }).code === "resource_missing") return false;
    throw err;
  }
}

export interface ApplySubscriptionDeps {
  /** 保存中の契約が生きているか（テストで差し替える） */
  isAlive?: (subscriptionId: string) => Promise<boolean>;
}

/**
 * サブスクリプションの状態を保存する。保存しなかったら false。
 *   - 同じ契約の古いイベント
 *   - 生きている契約があるのに届いた別の契約のイベント（二重の申し込み・解約した古い契約の遅れたイベント）。
 *     二重に払っている可能性があるので、運用者が気づけるようにログに残す（返金は Stripe の画面で）
 * customerId を渡せば顧客 ID も同時に結びつける。
 */
export async function applySubscription(
  userId: string,
  sub: SubscriptionLike,
  eventCreated: number,
  customerId: string | null = null,
  deps: ApplySubscriptionDeps = {},
): Promise<StripeState | false> {
  const { client, publicMetadata, privateMetadata } = await loadUser(userId);
  const current = stripeStateFromMetadata(publicMetadata);
  const decision = decideSubscriptionEvent(current, sub.id, eventCreated);
  if (decision === "stale") return false;
  if (decision === "other-live" && current) {
    // 取りこぼしたイベントで「生きている」と思い込んでいるだけなら、新しい契約を締め出さない
    if (await (deps.isAlive ?? isSubscriptionAlive)(current.subscriptionId)) {
      console.error(
        `[billing] ${userId} には有効な契約 ${current.subscriptionId} があるため、別の契約 ${sub.id}（${sub.status}）のイベントを保存しませんでした。二重の申し込みなら Stripe の画面で片方を解約・返金してください`,
      );
      return false;
    }
  }
  const priceId = sub.items.data[0]?.price.id ?? null;
  const plan = planForSubscription({
    priceId,
    metadataPlan: sub.metadata?.plan,
    current: current && current.subscriptionId === sub.id ? current : null,
    planForPrice: planForPriceId,
    priceOfPlan: priceIdOf,
  });
  const next = stateFromSubscription(sub, eventCreated, { plan });
  await client.users.updateUserMetadata(userId, {
    // 変えるキーだけを送る（深いマージなので他のキーは残る）
    publicMetadata: { [STRIPE_STATE_KEY]: next },
    ...(customerId && privateMetadata[STRIPE_CUSTOMER_KEY] !== customerId ? { privateMetadata: { [STRIPE_CUSTOMER_KEY]: customerId } } : {}),
  });
  return next;
}
