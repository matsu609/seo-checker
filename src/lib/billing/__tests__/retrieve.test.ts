/**
 * Webhook が使うサブスクリプションの取得（stripe.ts の retrieveSubscription）。
 * 割引のクーポンまで展開して取るが、Stripe が展開の指定を受け付けなかったら展開なしで取り直す
 * （ここが落ちると Webhook が 500 を返し続け、契約状態が書けなくなるため。2026-09-23）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieve = vi.fn();

vi.mock("stripe", () => {
  class StripeError extends Error {
    param?: string;
    constructor(message: string, param?: string) {
      super(message);
      this.param = param;
    }
  }
  class StripeInvalidRequestError extends StripeError {}
  class FakeStripe {
    static errors = { StripeError, StripeInvalidRequestError };
    subscriptions = { retrieve: (...a: unknown[]) => retrieve(...a) };
  }
  return { default: FakeStripe };
});

import Stripe from "stripe";
import { retrieveSubscription, SUBSCRIPTION_EXPAND } from "../stripe";

type ErrorCtor = new (message: string, param?: string) => Error;

beforeEach(() => {
  retrieve.mockReset();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("サブスクリプションの取得", () => {
  it("割引のクーポンまで展開して 1 回で取る", async () => {
    retrieve.mockResolvedValue({ id: "sub_1" });
    await expect(retrieveSubscription("sub_1")).resolves.toEqual({ id: "sub_1" });
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(retrieve).toHaveBeenCalledWith("sub_1", { expand: [...SUBSCRIPTION_EXPAND] });
  });

  it("展開の指定が受け付けられなければ、展開なしで取り直す", async () => {
    const Invalid = (Stripe as unknown as { errors: { StripeInvalidRequestError: ErrorCtor } }).errors.StripeInvalidRequestError;
    retrieve.mockRejectedValueOnce(new Invalid("This property cannot be expanded", "expand[0]")).mockResolvedValueOnce({ id: "sub_1" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(retrieveSubscription("sub_1")).resolves.toEqual({ id: "sub_1" });
    expect(retrieve).toHaveBeenLastCalledWith("sub_1");
    warn.mockRestore();
  });

  it("それ以外の失敗は投げる（Webhook が 500 を返し、Stripe が送り直す）", async () => {
    retrieve.mockRejectedValue(new Error("network"));
    await expect(retrieveSubscription("sub_1")).rejects.toThrow("network");
    expect(retrieve).toHaveBeenCalledTimes(1);
  });
});
