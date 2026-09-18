/**
 * 割引のパターンに対応する Stripe のクーポンを用意する（サーバー専用）。
 *
 * クーポンは Stripe の画面で手で作らず、ここが決まった ID で自動で作る（無ければ作る・あれば使う）。
 * 運用者の作業を「画面で割引を選ぶ」だけにするため。テスト鍵と本番鍵で別々に作られる。
 *
 * 商品の限定（applies_to）は付けない。スタンダード専用という制限はアプリ側（/api/billing/checkout が
 * ライトには割引を付けない）で守る。Checkout に渡すクーポンをできるだけ素直な形にして、
 * 失敗の余地を減らすため（2026-09-18 に本番で「申し込み画面を開けませんでした」が出た際に単純化）。
 */
import Stripe from "stripe";
import type { PromoPattern } from "./promo";

export function couponIdFor(pattern: PromoPattern): string {
  return `seo-checker-off${pattern.amountOff}`;
}

function isStripeCode(err: unknown, code: string): boolean {
  return err instanceof Stripe.errors.StripeError && err.code === code;
}

/** パターンのクーポン ID（値引きが無いパターンは null）。無ければ Stripe に作る */
export async function ensureCoupon(stripe: Stripe, pattern: PromoPattern): Promise<string | null> {
  if (pattern.amountOff <= 0) return null;
  const id = couponIdFor(pattern);
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
    });
  } catch (err) {
    // 同時に 2 人が申し込んで先に作られていたら、それを使う
    if (!isStripeCode(err, "resource_already_exists")) throw err;
  }
  return id;
}
