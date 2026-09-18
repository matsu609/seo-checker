/**
 * 割引コード（スタンダード専用・10 パターン。利用者の決定 2026-09-18）。
 * PROMO_CODES の読み方、コードの正規化、パターンの内容、画面に出す説明を固定する。
 */
import { describe, expect, it } from "vitest";
import {
  FIRST_MONTH_FREE_DAYS,
  hasPromoCodes,
  monthlyAfter,
  normalizeCode,
  parsePromoCodes,
  patternById,
  patternLabel,
  PROMO_PATTERNS,
  promoPlanPriceYen,
  resolvePromoCode,
} from "../promo";

describe("パターン", () => {
  it("10 パターン: 月額 1〜5 万円引き、30 日無料、30 日無料 + 1〜4 万円引き", () => {
    expect(PROMO_PATTERNS.map((p) => p.id)).toEqual(["off10", "off20", "off30", "off40", "off50", "free", "free-off10", "free-off20", "free-off30", "free-off40"]);
    expect(promoPlanPriceYen()).toBe(50_000);
    expect(FIRST_MONTH_FREE_DAYS).toBe(30);
  });

  it("値引き後の月額は定価 50,000 円から引いた額。off50 は 0 円", () => {
    expect(monthlyAfter(patternById("off10")!)).toBe(40_000);
    expect(monthlyAfter(patternById("off50")!)).toBe(0);
    expect(monthlyAfter(patternById("free")!)).toBe(50_000);
    expect(monthlyAfter(patternById("free-off40")!)).toBe(10_000);
  });

  it("無料期間が付くのは free 系だけ", () => {
    expect(PROMO_PATTERNS.filter((p) => p.firstMonthFree).map((p) => p.id)).toEqual(["free", "free-off10", "free-off20", "free-off30", "free-off40"]);
  });

  it("説明文は金額と無料期間を含む（公開ページには出さず、コードを確認した人にだけ見せる）", () => {
    expect(patternLabel(patternById("off10")!)).toBe("スタンダード: 月額 10,000 円引き（毎月 40,000 円・ずっと）");
    expect(patternLabel(patternById("off50")!)).toBe("スタンダード: 月額 50,000 円引き（毎月 0 円・ずっと無料）");
    expect(patternLabel(patternById("free")!)).toBe("スタンダード: 最初の 30 日間は無料（30 日後から毎月 50,000 円）");
    expect(patternLabel(patternById("free-off20")!)).toBe("スタンダード: 最初の 30 日間は無料 + 月額 20,000 円引き（30 日後から毎月 30,000 円）");
  });

  it("知らないパターン名は null", () => {
    expect(patternById("off60")).toBeNull();
    expect(patternById("")).toBeNull();
    expect(patternById(" OFF10 ")).not.toBeNull();
  });
});

describe("PROMO_CODES の読み方", () => {
  it("カンマ・改行で区切り、コードは大文字化して空白を除く", () => {
    const map = parsePromoCodes("wolf-a7k2=off10,\n TANAKA q9 = free-off20 \n zero=OFF50");
    expect([...map.keys()]).toEqual(["WOLF-A7K2", "TANAKAQ9", "ZERO"]);
    expect(map.get("WOLF-A7K2")?.id).toBe("off10");
    expect(map.get("TANAKAQ9")?.id).toBe("free-off20");
    expect(map.get("ZERO")?.id).toBe("off50");
  });

  it("形が違う項目・知らないパターンは無視する（他の項目は生きる）", () => {
    const map = parsePromoCodes("A=off10, broken, B=off99, =off20, C=free");
    expect([...map.keys()]).toEqual(["A", "C"]);
  });

  it("未設定なら空。hasPromoCodes は 1 つでもあれば true", () => {
    expect(parsePromoCodes(undefined).size).toBe(0);
    expect(hasPromoCodes(undefined)).toBe(false);
    expect(hasPromoCodes("x=off10")).toBe(true);
    expect(hasPromoCodes("x=bad")).toBe(false);
  });

  it("コードの照合は正規化した形で行う", () => {
    expect(normalizeCode(" wolf a7k2 ")).toBe("WOLFA7K2");
    expect(resolvePromoCode("wolf-a7k2", "WOLF-A7K2=free-off10")?.id).toBe("free-off10");
    expect(resolvePromoCode("nope", "WOLF-A7K2=free-off10")).toBeNull();
    expect(resolvePromoCode("", "WOLF-A7K2=free-off10")).toBeNull();
  });
});
