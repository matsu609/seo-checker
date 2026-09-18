/**
 * Stripe の呼び出し（Checkout・カスタマーポータル・Webhook の署名検証）。サーバー専用。
 *
 * 環境変数:
 *   STRIPE_SECRET_KEY      … sk_test_ / sk_live_（Stripe ダッシュボード → 開発者 → API キー）
 *   STRIPE_PRICE_STANDARD  … スタンダード（月 50,000 円・本命）の Price ID（price_…）。旧名 STRIPE_PRICE_PRO も読む
 *   STRIPE_PRICE_LIGHT     … ライト（月 38,000 円）の Price ID。未設定ならライトの「申し込む」は出ない
 *   STRIPE_PRICE_PREMIUM   … プレミアム（月 150,000 円）の Price ID。任意。画面には出ないが、
 *                            支払いリンクや請求書で契約を立てたときに「プレミアムの契約」として記録するために使う
 *   STRIPE_WEBHOOK_SECRET  … Webhook エンドポイントの署名シークレット（whsec_…）
 * 鍵・スタンダードの Price・Webhook の 3 つがそろって初めて料金画面に「申し込む」が出る（isStripeConfigured）。
 *   STRIPE_TRIAL_DAYS      … 全員に付ける無料期間の日数（任意。既定 0 = トライアルなし。緊急時の逃げ道）。
 *                            初月無料は全員に自動で付けず、クーポン（100% 割引・1 回）のプロモーションコードで相手ごとに渡す。
 *
 * プレミアム（伴走・月 3 社まで）は料金画面に「申し込む」を出さない（枠の確認が要るのでお問い合わせから受ける）。
 * 受注が決まった相手には Stripe の支払いリンク・請求書で契約を立てるので、その価格を
 * STRIPE_PRICE_PREMIUM に入れておくと、契約がプレミアムとして記録される。
 *
 * 割引は Stripe のクーポン → プロモーションコードで行う（利用者の決定 2026-09-13）。
 * 申し込み画面でコードを入力した人だけに適用されるので、コードを持たない人の支払額は定価のまま。
 * 初月無料も同じ仕組み（100% 割引・期間「1 回」のクーポン）で相手ごとに渡す（利用者の決定 2026-09-18）。
 * どちらのコードを渡すかは相手によって使い分ける（月額の値引き / 初月無料）。
 * ただし「高いので下げてほしい」にはクーポンではなくライトを案内する（2026-09-15 の 3 段階化の趣旨）。
 *
 * カードの変更・解約・請求書の閲覧は Stripe のカスタマーポータルに任せる（自前でカード番号を扱わない）。
 */
import Stripe from "stripe";
import { PLANS, STRIPE_PLANS, type PlanId } from "@/lib/plans/catalog";
import { trialDays } from "./trial";

export { DEFAULT_TRIAL_DAYS, trialDays } from "./trial";

function env(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** 決済（申し込み・お支払い方法の変更）を出してよいか。本命のスタンダードが買えることが条件 */
export function isStripeConfigured(): boolean {
  return env("STRIPE_SECRET_KEY") !== null && priceIdOf("standard") !== null && env("STRIPE_WEBHOOK_SECRET") !== null;
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

/** プランごとの Price ID を入れる環境変数の名前（先に見つかったものを使う） */
const PRICE_ENV: Partial<Record<PlanId, readonly string[]>> = {
  light: ["STRIPE_PRICE_LIGHT"],
  // STRIPE_PRICE_PRO は 2026-09-15 までの「オールインワン」の変数名。Vercel に残っていても動くようにしておく
  standard: ["STRIPE_PRICE_STANDARD", "STRIPE_PRICE_PRO"],
  // プレミアム（伴走）は画面から買えない（月 3 社の枠を確認してから受ける）。
  // それでも Price を置けるようにしておくのは、受注が決まった相手に支払いリンクや請求書で
  // サブスクリプションを立てたとき、Webhook が「プレミアムの契約」として記録できるようにするため。
  // 未設定なら価格が対応表に無いことになり、契約が本命（スタンダード）として記録されてしまう。
  premium: ["STRIPE_PRICE_PREMIUM"],
};

/** そのプランの Price ID（未設定なら null = 画面に「申し込む」を出さない） */
export function priceIdOf(plan: PlanId): string | null {
  for (const name of PRICE_ENV[plan] ?? []) {
    const id = env(name);
    if (id) return id;
  }
  return null;
}

/** いま画面から買えるプラン（Price ID がそろっているものだけ。安い順） */
export function purchasablePlanIds(): PlanId[] {
  return STRIPE_PLANS.filter((p) => priceIdOf(p.id) !== null).map((p) => p.id);
}

/**
 * Stripe の Price ID からプランを引く（Webhook が契約状態に書き込むときに使う）。
 *
 * 画面から買えるプランだけでなく、プレミアムのように運用者が Stripe 側だけで契約を立てる
 * プランも見る（`purchasablePlanIds()` と範囲が違うのは意図的。申し込みの可否と、
 * 立った契約をどう読むかは別の話）。
 */
export function planForPriceId(priceId: string | null): PlanId | null {
  if (!priceId) return null;
  return PLANS.find((p) => priceIdOf(p.id) === priceId)?.id ?? null;
}

export interface CheckoutInput {
  /** 申し込むプラン（画面から買えるものだけ） */
  plan: PlanId;
  userId: string;
  email: string | null;
  /** 既に Stripe の顧客があればその ID（2 回目以降の申し込みで顧客を増やさない） */
  customerId: string | null;
  /** https://app.seo-checker.tokyo のような origin。戻り先に使う */
  origin: string;
}

/** 申し込み画面（Stripe Checkout）。返る URL に遷移させる */
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const price = priceIdOf(input.plan);
  if (!price) throw new Error(`${input.plan} の Price ID が未設定です`);
  const stripe = getStripe();
  const days = trialDays();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    // Webhook で Clerk のユーザーに結びつけるための手がかり（両方に入れる）
    client_reference_id: input.userId,
    metadata: { userId: input.userId, plan: input.plan },
    subscription_data: {
      metadata: { userId: input.userId, plan: input.plan },
      // STRIPE_TRIAL_DAYS が正のときだけ全員にトライアルが付く（既定は 0 = なし。初月無料はクーポンで相手ごとに）
      ...(days > 0 ? { trial_period_days: days } : {}),
    },
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
