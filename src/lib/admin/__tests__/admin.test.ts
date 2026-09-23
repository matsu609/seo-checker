/**
 * マスター画面まわりのテスト。
 *
 * 特に管理者判定は、間違えると全顧客の請求情報が他人に見える。
 * 「閉じる方向に倒れているか」を重点的に固定する。
 */
import { describe, expect, it } from "vitest";
import { isAdminEmail, parseAdminEmails } from "../config";
import { stateFromSubscription } from "@/lib/billing/state";
import { contractStatusOf, NO_CONTRACT, summarizeBilling, summarizeStripeState, toMoney } from "../billing";

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

describe("契約状況（Stripe の契約状態から）", () => {
  const SUB = {
    id: "sub_1",
    status: "active",
    cancel_at_period_end: false,
    items: { data: [{ price: { id: "price_standard", unit_amount: 50_000, currency: "jpy" }, current_period_end: 1_760_000_000 }] },
  };
  const state = (status: string, cancelAtPeriodEnd = false) =>
    stateFromSubscription({ ...SUB, status, cancel_at_period_end: cancelAtPeriodEnd }, 1, { plan: "standard" });

  it("色分けの区分", () => {
    expect(contractStatusOf(state("active"))).toBe("active");
    expect(contractStatusOf(state("trialing"))).toBe("trial");
    expect(contractStatusOf(state("past_due"))).toBe("past_due");
    expect(contractStatusOf(state("active", true))).toBe("canceled");
    expect(contractStatusOf(state("canceled"))).toBe("ended");
    expect(contractStatusOf(state("incomplete_expired"))).toBe("ended");
    expect(contractStatusOf(state("incomplete"))).toBe("upcoming");
  });

  // 2026-09-23 まで未払いは「終了」、一時停止は「不明」と出ていた。どちらも Stripe 上は契約が残っていて対応が要る
  it("未払い・一時停止は終了扱いにせず、お客様の画面と同じ呼び名で出す", () => {
    expect(contractStatusOf(state("unpaid"))).toBe("past_due");
    expect(summarizeStripeState(state("unpaid")).statusLabel).toBe("未払い（停止中）");
    expect(contractStatusOf(state("paused"))).toBe("canceled");
    expect(summarizeStripeState(state("paused")).statusLabel).toBe("一時停止");
  });

  it("呼び名はお客様の画面と同じ表から引く（運用者向けにはカードの確認の一言を付けない）", () => {
    expect(summarizeStripeState(state("past_due")).statusLabel).toBe("支払い遅延");
    expect(summarizeStripeState(state("active", true)).statusLabel).toBe("契約中（期間末で解約予定）");
  });

  it("契約が無ければ「契約なし」", () => {
    expect(summarizeBilling(null)).toEqual(NO_CONTRACT);
    expect(NO_CONTRACT.statusLabel).toBe("契約なし");
    expect(NO_CONTRACT.plan).toBeNull();
    expect(summarizeBilling(state("active")).plan).toBe("standard");
  });
});
