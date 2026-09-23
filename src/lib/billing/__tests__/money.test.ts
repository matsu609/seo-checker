/**
 * 金額の表示（お客様の画面と顧客管理で共通）。
 * 小数を持たない通貨を 100 で割ると、50,000 円が 500 円に見えてしまう。
 */
import { describe, expect, it } from "vitest";
import { isZeroDecimal, moneyFromMinor } from "../money";

describe("金額の表示", () => {
  it("円は割らない", () => {
    expect(moneyFromMinor(50_000, "jpy")).toMatchObject({ value: 50_000, currency: "JPY" });
    expect(moneyFromMinor(50_000, "JPY")?.label).toContain("50,000");
  });

  // 2026-09-23 まで、お客様の画面は JPY / KRW / VND の 3 通貨しか「割らない」一覧に入れていなかった
  it("小数を持たない通貨は Stripe の一覧どおり", () => {
    for (const code of ["JPY", "KRW", "VND", "CLP", "XAF", "XOF", "XPF", "PYG", "UGX"]) {
      expect(isZeroDecimal(code), code).toBe(true);
      expect(moneyFromMinor(1000, code)?.value, code).toBe(1000);
    }
  });

  it("ドルはセントから直す", () => {
    const money = moneyFromMinor(1050, "usd");
    expect(money?.value).toBe(10.5);
    expect(money?.label).toContain("10.50");
  });

  it("通貨が無ければ円、読めない値は null", () => {
    expect(moneyFromMinor(3000, null)?.currency).toBe("JPY");
    expect(moneyFromMinor("3000", "JPY")).toBeNull();
    expect(moneyFromMinor(Number.NaN, "JPY")).toBeNull();
  });

  it("知らない通貨コードでも落ちない", () => {
    expect(() => moneyFromMinor(100, "ZZZZ")).not.toThrow();
  });
});
