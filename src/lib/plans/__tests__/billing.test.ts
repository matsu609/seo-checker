/**
 * 料金表を出す条件のテスト。
 *
 * Clerk のキーが無いまま PricingTable を描くと料金プランの画面ごと落ちるので、
 * 「フラグだけ立っている」状態で出さないことをここで固定する。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { isBillingEnabled, isBillingFlagOn } from "../billing";

function setEnv(env: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) vi.stubEnv(key, "");
    else vi.stubEnv(key, value);
  }
}

const CLERK_KEYS = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_x",
  CLERK_SECRET_KEY: "sk_test_x",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("決済フラグ", () => {
  it("1 のときだけ立つ", () => {
    setEnv({ NEXT_PUBLIC_CLERK_BILLING_ENABLED: "1" });
    expect(isBillingFlagOn()).toBe(true);
  });

  it("未設定や別の値では立たない", () => {
    setEnv({ NEXT_PUBLIC_CLERK_BILLING_ENABLED: undefined });
    expect(isBillingFlagOn()).toBe(false);
    setEnv({ NEXT_PUBLIC_CLERK_BILLING_ENABLED: "true" });
    expect(isBillingFlagOn()).toBe(false);
    setEnv({ NEXT_PUBLIC_CLERK_BILLING_ENABLED: "0" });
    expect(isBillingFlagOn()).toBe(false);
  });
});

describe("料金表を出す条件", () => {
  it("フラグと Clerk のキーが両方そろったら出す", () => {
    setEnv({ ...CLERK_KEYS, NEXT_PUBLIC_CLERK_BILLING_ENABLED: "1" });
    expect(isBillingEnabled()).toBe(true);
  });

  // ここが本題。ClerkProvider が無い環境で描画すると画面が落ちる
  it("Clerk のキーが無ければ、フラグが立っていても出さない", () => {
    setEnv({
      NEXT_PUBLIC_CLERK_BILLING_ENABLED: "1",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: undefined,
      CLERK_SECRET_KEY: undefined,
    });
    expect(isBillingEnabled()).toBe(false);
  });

  it("秘密キーだけ欠けていても出さない", () => {
    setEnv({
      ...CLERK_KEYS,
      NEXT_PUBLIC_CLERK_BILLING_ENABLED: "1",
      CLERK_SECRET_KEY: undefined,
    });
    expect(isBillingEnabled()).toBe(false);
  });

  it("フラグを立てていなければ出さない", () => {
    setEnv({ ...CLERK_KEYS, NEXT_PUBLIC_CLERK_BILLING_ENABLED: undefined });
    expect(isBillingEnabled()).toBe(false);
  });
});
