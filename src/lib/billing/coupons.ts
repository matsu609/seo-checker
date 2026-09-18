/**
 * 割引コードのパターンに対応する Stripe のクーポンを用意する（サーバー専用）。
 *
 * クーポンは Stripe の画面で手で作らず、ここが決まった ID で自動で作る（無ければ作る・あれば使う）。
 * 運用者の作業を「PROMO_CODES にコードを書く」だけにするため。テスト鍵と本番鍵で別々に作られる。
 *
 * ID にはスタンダードの商品 ID を含める。Stripe の商品を作り直したときに、古い商品にしか
 * 効かないクーポンを掴まないようにするため（applies_to.products で商品を限定している）。
 */
import Stripe from "stripe";
import type { PromoPattern } from "./promo";

export function couponIdFor(pattern: PromoPattern, productId: string): string {
  return `seo-checker-off${pattern.amountOff}-${productId}`;
}

function isStripeCode(err: unknown, code: string): boolean {
  return err instanceof Stripe.errors.StripeError && err.code === code;
}

/** その Price が属する商品の ID */
export async function productIdOfPrice(stripe: Stripe, priceId: string): Promise<string> {
  const price = await stripe.prices.retrieve(priceId);
  return typeof price.product === "string" ? price.product : price.product.id;
}

/** パターンのクーポン ID（値引きが無いパターンは null）。無ければ Stripe に作る */
export async function ensureCoupon(stripe: Stripe, pattern: PromoPattern, productId: string): Promise<string | null> {
  if (pattern.amountOff <= 0) return null;
  const id = couponIdFor(pattern, productId);
  try {
    const existing = await stripe.coupons.retrieve(id);
    if (existing.valid) return id;
    // 削除済み・無効なら作り直せないので、そのまま失敗させる（運用者が気づけるようにログに出す）
    throw new Error(`Stripe のクーポン ${id} が無効になっています。Stripe の画面で削除してからやり直してください`);
  } catch (err) {
    if (!isStripeCode(err, "resource_missing")) throw err;
  }
  try {
    await stripe.coupons.create({
      id,
      name: `スタンダード 月額 ${pattern.amountOff.toLocaleString("ja-JP")} 円引き`,
      amount_off: pattern.amountOff,
      currency: "jpy",
      duration: "forever",
      applies_to: { products: [productId] },
    });
  } catch (err) {
    // 同時に 2 人が申し込んで先に作られていたら、それを使う
    if (!isStripeCode(err, "resource_already_exists")) throw err;
  }
  return id;
}
