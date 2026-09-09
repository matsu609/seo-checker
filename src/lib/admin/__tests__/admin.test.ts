/**
 * マスター画面まわりのテスト。
 *
 * 特に管理者判定は、間違えると全顧客の請求情報が他人に見える。
 * 「閉じる方向に倒れているか」を重点的に固定する。
 */
import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "../config";
import { summarizeSubscription, toContractStatus, toMoney } from "../billing";

describe("管理者メールの読み取り", () => {
  it("カンマ・空白・改行で区切れる", () => {
    expect(parseAdminEmails("a@example.com, b@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(parseAdminEmails("a@example.com b@example.com")).toHaveLength(2);
    expect(parseAdminEmails("a@example.com\nb@example.com")).toHaveLength(2);
  });

  it("大文字・前後の空白をそろえる", () => {
    expect(parseAdminEmails("  A@Example.COM  ")).toEqual(["a@example.com"]);
  });

  it("重複を落とす", () => {
    expect(parseAdminEmails("a@example.com,A@example.com")).toEqual(["a@example.com"]);
  });

  // "*" や "all" のような値を管理者として通さない
  it("メールに見えない値は捨てる", () => {
    expect(parseAdminEmails("*")).toEqual([]);
    expect(parseAdminEmails("all,admin")).toEqual([]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails(undefined)).toEqual([]);
  });
});

describe("管理者かどうか", () => {
  const allowed = ["wolf@example.com"];

  it("一致すれば管理者", () => {
    expect(isAdminEmail("wolf@example.com", allowed)).toBe(true);
    expect(isAdminEmail("WOLF@Example.com", allowed)).toBe(true);
    expect(isAdminEmail(" wolf@example.com ", allowed)).toBe(true);
  });

  it("違えば管理者でない", () => {
    expect(isAdminEmail("other@example.com", allowed)).toBe(false);
  });

  // 一覧が空のときに誰かが通ると、未設定の本番で全公開になる
  it("一覧が空なら誰も通さない", () => {
    expect(isAdminEmail("wolf@example.com", [])).toBe(false);
  });

  it("空のメールは通さない", () => {
    expect(isAdminEmail(null, allowed)).toBe(false);
    expect(isAdminEmail(undefined, allowed)).toBe(false);
    expect(isAdminEmail("", allowed)).toBe(false);
    expect(isAdminEmail("   ", allowed)).toBe(false);
    expect(isAdminEmail("", [""])).toBe(false);
  });
});

describe("金額の表示", () => {
  // 円は最小単位が 1 円。100 で割ると 50 円になってしまう
  it("円は割らない", () => {
    const money = toMoney({ amount: 5000, currency: "JPY" });
    expect(money?.value).toBe(5000);
    expect(money?.label).toContain("5,000");
  });

  it("ドルはセントから直す", () => {
    const money = toMoney({ amount: 1000, currency: "USD" });
    expect(money?.value).toBe(10);
    expect(money?.label).toContain("10.00");
  });

  it("読めない値は null", () => {
    expect(toMoney(null)).toBeNull();
    expect(toMoney({})).toBeNull();
    expect(toMoney({ amount: "5000" })).toBeNull();
    expect(toMoney({ amount: Number.NaN, currency: "JPY" })).toBeNull();
  });
});

describe("契約状況", () => {
  it("Clerk の値を日本語の区分に直す", () => {
    expect(toContractStatus("active", false)).toBe("active");
    expect(toContractStatus("past_due", false)).toBe("past_due");
    expect(toContractStatus("canceled", false)).toBe("canceled");
    expect(toContractStatus("ended", false)).toBe("ended");
  });

  // トライアル中は status が active のままなので、item 側を見ないと分からない
  it("無料トライアルが最優先", () => {
    expect(toContractStatus("active", true)).toBe("trial");
  });

  it("知らない値は unknown", () => {
    expect(toContractStatus("something", false)).toBe("unknown");
    expect(toContractStatus(null, false)).toBe("unknown");
  });
});

describe("契約情報のまとめ", () => {
  const subscription = {
    status: "active",
    subscriptionItems: [
      {
        status: "active",
        isFreeTrial: false,
        periodEnd: 1_700_000_000_000,
        amount: { amount: 5000, currency: "JPY" },
        plan: { name: "スタンダード", slug: "standard" },
      },
    ],
    nextPayment: {
      date: 1_700_000_000_000,
      amount: { amount: 4000, currency: "JPY" },
      totals: {
        subtotal: { amount: 5000, currency: "JPY" },
        grandTotal: { amount: 4000, currency: "JPY" },
        discounts: {
          discount: {
            name: "初回割引",
            effect: "percentage",
            percentOff: 20,
            promoCode: "HAJIME20",
            amount: { amount: 1000, currency: "JPY" },
            cyclesRemaining: 3,
          },
        },
      },
    },
  };

  it("プラン・金額・次回請求を取り出す", () => {
    const s = summarizeSubscription(subscription);
    expect(s.status).toBe("active");
    expect(s.plan).toBe("standard");
    expect(s.planName).toBe("スタンダード");
    expect(s.monthly?.value).toBe(4000);
    expect(s.nextPaymentAt).toBe(1_700_000_000_000);
  });

  // 請求されるのは割引後。ここを間違えると売上の見立てがずれる
  it("月額は割引後の金額", () => {
    const s = summarizeSubscription(subscription);
    expect(s.monthly?.value).toBe(4000);
    expect(s.subtotal?.value).toBe(5000);
  });

  it("クーポンの内容を取り出す", () => {
    const s = summarizeSubscription(subscription);
    expect(s.coupon?.name).toBe("初回割引");
    expect(s.coupon?.promoCode).toBe("HAJIME20");
    expect(s.coupon?.effectLabel).toBe("20% 割引");
    expect(s.coupon?.amount?.value).toBe(1000);
    expect(s.coupon?.cyclesRemaining).toBe(3);
  });

  it("金額での割引も読める", () => {
    const s = summarizeSubscription({
      status: "active",
      subscriptionItems: [{ status: "active" }],
      nextPayment: {
        totals: {
          grandTotal: { amount: 4000, currency: "JPY" },
          discounts: {
            discount: { name: "紹介", effect: "fixed_amount", amountOff: { amount: 1000, currency: "JPY" } },
          },
        },
      },
    });
    expect(s.coupon?.effectLabel).toContain("1,000");
    expect(s.coupon?.promoCode).toBeNull();
  });

  it("クーポンが無ければ null", () => {
    const s = summarizeSubscription({
      status: "active",
      subscriptionItems: [{ status: "active", plan: { name: "プロ", slug: "pro" } }],
      nextPayment: { date: 1, amount: { amount: 10000, currency: "JPY" }, totals: null },
    });
    expect(s.coupon).toBeNull();
    expect(s.monthly?.value).toBe(10000);
  });

  // 契約が無いユーザーは 404 になるので null が渡ってくる
  it("契約が無ければ「契約なし」", () => {
    const s = summarizeSubscription(null);
    expect(s.status).toBe("none");
    expect(s.statusLabel).toBe("契約なし");
    expect(s.monthly).toBeNull();
    expect(s.plan).toBeNull();
  });

  // 公開ベータの API なので、形が変わっても画面ごと落とさない
  it("壊れた値でも落ちない", () => {
    expect(() => summarizeSubscription({ subscriptionItems: "x", nextPayment: 3 })).not.toThrow();
    expect(summarizeSubscription({ subscriptionItems: [null, 1] }).status).toBe("unknown");
  });

  it("終わった item は無視して今の契約を見る", () => {
    const s = summarizeSubscription({
      status: "active",
      subscriptionItems: [
        { status: "ended", plan: { name: "旧", slug: "free" } },
        { status: "active", plan: { name: "プロ", slug: "pro" } },
      ],
    });
    expect(s.plan).toBe("pro");
  });

  // Clerk 側のスラッグを打ち間違えると「決済は通ったのに機能が開かない」
  it("知らないスラッグは null にして、名前だけ残す", () => {
    const s = summarizeSubscription({
      status: "active",
      subscriptionItems: [{ status: "active", plan: { name: "特別プラン", slug: "tokubetsu" } }],
    });
    expect(s.plan).toBeNull();
    expect(s.planName).toBe("特別プラン");
  });
});
