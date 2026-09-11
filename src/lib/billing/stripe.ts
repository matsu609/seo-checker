/**
 * Stripe の呼び出し（Checkout・カスタマーポータル・Webhook の署名検証）。サーバー専用。
 *
 * 環境変数:
 *   STRIPE_SECRET_KEY     … sk_test_ / sk_live_（Stripe ダッシュボード → 開発者 → API キー）
 *   STRIPE_PRICE_PRO      … オールインワン（月 9,800 円）の Price ID（price_…）
 *   STRIPE_WEBHOOK_SECRET … Webhook エンドポイントの署名シークレット（whsec_…）
 * 3 つそろって初めて料金画面に「申し込む」が出る（isStripeConfigured）。
 *
 * カードの変更・解約・請求書の閲覧は Stripe のカスタマーポータルに任せる（自前でカード番号を扱わない）。
 */
import Stripe from "stripe";

function env(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** 決済（申し込み・お支払い方法の変更）を出してよいか */
export function isStripeConfigured(): boolean {
  return env("STRIPE_SECRET_KEY") !== null && env("STRIPE_PRICE_PRO") !== null && env("STRIPE_WEBHOOK_SECRET") !== null;
}

/** 本番キーか（画面に「テストモード」を出す判断に使う） */
export function isStripeLive(): boolean {
  return env("STRIPE_SECRET_KEY")?.startsWith("sk_live_") ?? false;
}

let client: Stripe | null = null;
export function getStripe(): Stripe {
  const key = env("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY が未設定です");
  if (!client) client = new Stripe(key, { appInfo: { name: "seo-checker" } });
  return client;
}

export function proPriceId(): string {
  const id = env("STRIPE_PRICE_PRO");
  if (!id) throw new Error("STRIPE_PRICE_PRO が未設定です");
  return id;
}

export interface CheckoutInput {
  userId: string;
  email: string | null;
  /** 既に Stripe の顧客があればその ID（2 回目以降の申し込みで顧客を増やさない） */
  customerId: string | null;
  /** https://app.seo-checker.tokyo のような origin。戻り先に使う */
  origin: string;
}

/** オールインワンの申し込み画面（Stripe Checkout）。返る URL に遷移させる */
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: proPriceId(), quantity: 1 }],
    // Webhook で Clerk のユーザーに結びつけるための手がかり（両方に入れる）
    client_reference_id: input.userId,
    metadata: { userId: input.userId },
    subscription_data: { metadata: { userId: input.userId } },
    ...(input.customerId ? { customer: input.customerId } : input.email ? { customer_email: input.email } : {}),
    // クーポンコード（Stripe のプロモーションコード）を入力できるようにする
    allow_promotion_codes: true,
    locale: "ja",
    success_url: `${input.origin}/plans?checkout=success`,
    cancel_url: `${input.origin}/plans?checkout=cancel`,
  });
  if (!session.url) throw new Error("Stripe が申し込み画面の URL を返しませんでした");
  return session.url;
}

/** お支払い方法の変更・請求書・解約（Stripe カスタマーポータル）。返る URL に遷移させる */
export async function createPortalSession(customerId: string, origin: string): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/plans`,
    locale: "ja",
  });
  return session.url;
}

/** Webhook の本文と署名からイベントを復元する（署名が合わなければ例外） */
export function constructWebhookEvent(payload: string, signature: string): Stripe.Event {
  const secret = env("STRIPE_WEBHOOK_SECRET");
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET が未設定です");
  return getStripe().webhooks.constructEvent(payload, signature, secret);
}

export async function retrieveSubscription(id: string): Promise<Stripe.Subscription> {
  return getStripe().subscriptions.retrieve(id);
}

/** Checkout 完了イベントから、ユーザー ID・顧客 ID・サブスクリプション ID を取り出す */
export function checkoutIds(session: Stripe.Checkout.Session): { userId: string | null; customerId: string | null; subscriptionId: string | null } {
  const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null);
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : (session.subscription?.id ?? null);
  return { userId, customerId, subscriptionId };
}
