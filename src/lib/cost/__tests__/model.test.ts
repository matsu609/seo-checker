/**
 * 月額費用の試算（マスター画面のグラフ）を固定するテスト。
 * 「固定費は店舗数に関係なく一定」「変動費は店舗が増えると増える」「無料枠の中では 0」を守る。
 */
import { describe, expect, it } from "vitest";
import { INTEGRATION_KEYS } from "@/lib/features/integrations";
import { A, assumptions, COST_SERIES, costSteps, estimateMonthlyCost, pickSerpapiTier, seriesTotals, splitStores } from "../model";

describe("店舗数の割り振り", () => {
  it("スタンダードの割合で割り、合計は必ず店舗数", () => {
    expect(splitStores(10, 1)).toEqual({ light: 0, standard: 10 });
    expect(splitStores(10, 0)).toEqual({ light: 10, standard: 0 });
    expect(splitStores(7, 0.5)).toEqual({ light: 3, standard: 4 });
    expect(splitStores(-3, 0.5)).toEqual({ light: 0, standard: 0 });
    expect(splitStores(Number.NaN, 2)).toEqual({ light: 0, standard: 0 });
  });
});

describe("SerpApi のプラン選び", () => {
  it("必要な検索回数を満たす最小のプランを選ぶ", () => {
    expect(pickSerpapiTier(0).label).toBe("Free");
    expect(pickSerpapiTier(100).label).toBe("Free");
    expect(pickSerpapiTier(101).label).toBe("Starter");
    expect(pickSerpapiTier(5_000).label).toBe("Developer");
    expect(pickSerpapiTier(14_999).label).toBe("Production");
  });
  it("最上位を超えたら按分して線を延ばす（要問い合わせ）", () => {
    const t = pickSerpapiTier(60_000);
    expect(t.over).toBe(true);
    expect(t.usd).toBeCloseTo(550);
  });
});

describe("月額の試算", () => {
  it("全連携が 1 行ずつ入り、固定 + 変動 = 合計", () => {
    const est = estimateMonthlyCost({ stores: 10 });
    expect(est.lines.map((l) => l.key).sort()).toEqual([...INTEGRATION_KEYS].sort());
    expect(est.totalJpy).toBe(est.fixedJpy + est.variableJpy);
    expect(est.perStoreJpy).toBe(Math.round(est.totalJpy / 10));
    for (const l of est.lines) {
      expect(l.fixedJpy).toBeGreaterThanOrEqual(0);
      expect(l.variableJpy).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(l.fixedJpy) && Number.isInteger(l.variableJpy)).toBe(true);
    }
  });

  it("店舗 0 でも固定費（Vercel Pro・ドメイン）はかかり、変動費は 0", () => {
    const est = estimateMonthlyCost({ stores: 0, vercelPro: true, usdJpy: 160 });
    expect(est.variableJpy).toBe(0);
    expect(est.fixedJpy).toBe(20 * 160 + Math.round(A.domainYearlyJpy / 12));
    expect(est.revenueJpy).toBe(0);
    expect(est.grossRatio).toBeNull();
    expect(est.perStoreJpy).toBe(est.fixedJpy);
  });

  it("Vercel Pro と Clerk Pro を切ると固定費がそのぶん減る", () => {
    const on = estimateMonthlyCost({ stores: 5, vercelPro: true, clerkPro: true, usdJpy: 150 });
    const off = estimateMonthlyCost({ stores: 5, vercelPro: false, clerkPro: false, usdJpy: 150 });
    expect(on.fixedJpy - off.fixedJpy).toBe(20 * 150 + 25 * 150);
    expect(on.variableJpy).toBe(off.variableJpy);
  });

  it("店舗が増えると変動費は増え、1 店舗あたりは下がる（固定費が薄まる）", () => {
    const a = estimateMonthlyCost({ stores: 5 });
    const b = estimateMonthlyCost({ stores: 50 });
    expect(b.variableJpy).toBeGreaterThan(a.variableJpy);
    expect(b.perStoreJpy).toBeLessThan(a.perStoreJpy);
  });

  it("スタンダードだけ AI 検索モニタリング（DataForSEO）の原価が乗る", () => {
    const light = estimateMonthlyCost({ stores: 10, standardRatio: 0 });
    const standard = estimateMonthlyCost({ stores: 10, standardRatio: 1 });
    const dfs = (e: ReturnType<typeof estimateMonthlyCost>) => e.lines.find((l) => l.key === "dataforseo")!.variableJpy;
    expect(dfs(standard)).toBeGreaterThan(dfs(light));
    // 標準構成 $3.92 × 10 店 × 160 円 ≒ 6,272 円 + 手動 $0.03 × 10
    expect(dfs(standard)).toBe(Math.round((10 * (800 * 0.002 + 200 * 0.0026 + 1500 * 0.0012) + 10 * 0.03) * 160));
  });

  it("Places は無料枠の中なら 0、超えたぶんだけ課金", () => {
    // 1 店舗: Details 6 × 4.33 + 50 = 76 回 ≪ 1,000、Text Search 13 + 50 ≪ 5,000 → 0 円
    expect(estimateMonthlyCost({ stores: 1 }).lines.find((l) => l.key === "places")!.variableJpy).toBe(0);
    // 100 店舗: Details 2,650 回 → 1,650 回 × $0.02 が課金される
    const big = estimateMonthlyCost({ stores: 100, usdJpy: 160 }).lines.find((l) => l.key === "places")!;
    expect(big.variableJpy).toBeGreaterThan(0);
    expect(big.note).toContain("無料 1,000");
  });

  it("Stripe の手数料は売上の 3.6%", () => {
    const est = estimateMonthlyCost({ stores: 10, standardRatio: 1 });
    expect(est.revenueJpy).toBe(500_000);
    expect(est.lines.find((l) => l.key === "stripe")!.variableJpy).toBe(18_000);
  });

  it("Supabase / Resend は使用量が Free を超えたときだけ Pro の月額が立つ", () => {
    const small = estimateMonthlyCost({ stores: 10, usdJpy: 160 });
    expect(small.lines.find((l) => l.key === "supabase")!.fixedJpy).toBe(0);
    expect(small.lines.find((l) => l.key === "resend")!.fixedJpy).toBe(0);
    const big = estimateMonthlyCost({ stores: 400, usdJpy: 160 });
    expect(big.lines.find((l) => l.key === "supabase")!.fixedJpy).toBe(25 * 160);
    expect(big.lines.find((l) => l.key === "resend")!.fixedJpy).toBe(20 * 160);
  });

  it("為替が壊れた値なら既定の 160 円に倒す", () => {
    expect(estimateMonthlyCost({ stores: 1, usdJpy: 0 }).input.usdJpy).toBe(160);
    expect(estimateMonthlyCost({ stores: 1, usdJpy: Number.NaN }).input.usdJpy).toBe(160);
  });
});

describe("図の系列と前提", () => {
  it("系列は 6 本以内で、全連携をどれか 1 つに割り振る（漏れ・重複なし）", () => {
    expect(COST_SERIES.length).toBeLessThanOrEqual(6);
    const keys = COST_SERIES.flatMap((s) => [...s.keys]);
    expect(new Set(keys).size).toBe(keys.length);
    // 0 円の連携（PageSpeed など）は系列に入れなくてよいが、金額の出る連携は必ず入れる
    const est = estimateMonthlyCost({ stores: 100 });
    for (const l of est.lines) if (l.fixedJpy + l.variableJpy > 0) expect(keys).toContain(l.key);
    const totals = seriesTotals(est);
    expect(Object.values(totals).reduce((a, b) => a + b, 0)).toBe(est.totalJpy);
  });

  it("横軸の店舗数は選んだ値を含み、昇順で重複しない", () => {
    expect(costSteps(10)).toEqual([1, 3, 5, 10, 20, 30, 50, 100]);
    expect(costSteps(15)).toEqual([1, 3, 5, 10, 15, 20, 30, 50, 100]);
  });

  it("前提の表は数値を文で説明している", () => {
    const rows = assumptions();
    expect(rows.length).toBeGreaterThan(8);
    for (const r of rows) expect(r.value.length).toBeGreaterThan(5);
  });
});
