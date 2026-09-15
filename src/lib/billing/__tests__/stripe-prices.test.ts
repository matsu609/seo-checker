/**
 * Stripe の Price ID ↔ プランの対応。
 *
 * ここがずれると「払ったのに違うプランとして記録される」という静かな壊れ方をする。
 * とくにプレミアム（伴走）は料金画面に「申し込む」を出さないが、支払いリンク・請求書で
 * 立てた契約はプレミアムとして記録されなければならない（=「買えるか」と「読めるか」は別）。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planForPriceId, priceIdOf, purchasablePlanIds } from "../stripe";

const KEYS = ["STRIPE_PRICE_LIGHT", "STRIPE_PRICE_STANDARD", "STRIPE_PRICE_PRO", "STRIPE_PRICE_PREMIUM"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(original)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("Price ID からプランを引く", () => {
  it("設定してある分だけ引ける", () => {
    process.env.STRIPE_PRICE_LIGHT = "price_light";
    process.env.STRIPE_PRICE_STANDARD = "price_standard";
    expect(planForPriceId("price_light")).toBe("light");
    expect(planForPriceId("price_standard")).toBe("standard");
    expect(planForPriceId("price_unknown")).toBeNull();
    expect(planForPriceId(null)).toBeNull();
  });

  // 2026-09-15 より前に登録した環境変数名でもスタンダードとして読めること
  it("STRIPE_PRICE_PRO は STRIPE_PRICE_STANDARD の旧名として読む", () => {
    process.env.STRIPE_PRICE_PRO = "price_old";
    expect(priceIdOf("standard")).toBe("price_old");
    expect(planForPriceId("price_old")).toBe("standard");
  });

  it("新旧が両方あるときは新しい名前を使う", () => {
    process.env.STRIPE_PRICE_STANDARD = "price_new";
    process.env.STRIPE_PRICE_PRO = "price_old";
    expect(priceIdOf("standard")).toBe("price_new");
  });

  // プレミアムは画面から買えないが、Stripe 側で立てた契約は正しく読めないといけない
  it("プレミアムは「買えない」が「読める」", () => {
    process.env.STRIPE_PRICE_STANDARD = "price_standard";
    process.env.STRIPE_PRICE_PREMIUM = "price_premium";
    expect(planForPriceId("price_premium")).toBe("premium");
    expect(purchasablePlanIds()).toEqual(["standard"]);
  });

  it("画面から買えるのは Price がそろっているライトとスタンダードだけ", () => {
    expect(purchasablePlanIds()).toEqual([]);
    process.env.STRIPE_PRICE_STANDARD = "price_standard";
    expect(purchasablePlanIds()).toEqual(["standard"]);
    process.env.STRIPE_PRICE_LIGHT = "price_light";
    expect(purchasablePlanIds()).toEqual(["light", "standard"]);
  });
});
