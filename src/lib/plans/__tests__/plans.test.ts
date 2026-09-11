/**
 * プラン判定の回帰テスト。
 * ここが崩れると「有料機能が無料で使える」か「契約者が使えない」のどちらかになる。
 */
import { describe, expect, it } from "vitest";
import { features, FEATURE_GROUPS } from "@/lib/features/registry";
import {
  PLANS,
  PLAN_BY_ID,
  PLAN_IDS,
  PLAN_RANK,
  SELLABLE_PLANS,
  planAllows,
  planPriceLabel,
  planShortLabel,
  toPlanId,
  upgradeTarget,
  type PlanId,
} from "../catalog";

describe("プランの順位", () => {
  it("上位プランは下位の機能をすべて使える", () => {
    expect(planAllows("pro", "free")).toBe(true);
    expect(planAllows("pro", "standard")).toBe(true);
    expect(planAllows("pro", "pro")).toBe(true);
    expect(planAllows("standard", "free")).toBe(true);
    expect(planAllows("standard", "standard")).toBe(true);
  });

  it("下位プランは上位の機能を使えない", () => {
    expect(planAllows("free", "standard")).toBe(false);
    expect(planAllows("free", "pro")).toBe(false);
    expect(planAllows("standard", "pro")).toBe(false);
  });

  it("順位に重複が無い", () => {
    const ranks = PLAN_IDS.map((id) => PLAN_RANK[id]);
    expect(new Set(ranks).size).toBe(PLAN_IDS.length);
  });
});

describe("プラン ID の正規化", () => {
  it("Clerk の接頭辞つきでも受ける", () => {
    expect(toPlanId("user:pro")).toBe("pro");
    expect(toPlanId("org:standard")).toBe("standard");
    expect(toPlanId("PRO")).toBe("pro");
    expect(toPlanId(" free ")).toBe("free");
  });

  // 知らない値を勝手に上位プランへ倒さない
  it("知らない値は null", () => {
    expect(toPlanId("enterprise")).toBeNull();
    expect(toPlanId("")).toBeNull();
    expect(toPlanId(null)).toBeNull();
    expect(toPlanId(123)).toBeNull();
    expect(toPlanId({ plan: "pro" })).toBeNull();
  });
});

describe("価格の表示", () => {
  it("金額どおりに出す", () => {
    expect(planPriceLabel("free")).toBe("無料");
    expect(planPriceLabel("standard")).toBe("月額 6,800 円");
    expect(planPriceLabel("pro")).toBe("月額 9,800 円");
  });
});

describe("機能とプランの対応", () => {
  it("すべての機能にプランが設定されている", () => {
    for (const f of features) {
      expect(PLAN_IDS, `${f.id} のプランが不正`).toContain(f.plan);
    }
  });

  // 無料診断が有料になっていたら、見込み顧客の入口が塞がる
  it("無料診断と設定まわりは free のまま", () => {
    const free = features.filter((f) => f.plan === "free").map((f) => f.id);
    expect(free.sort()).toEqual(["free", "free-meo", "plans", "settings"]);
  });

  // AI が成果物を作る機能は pro に置く（値付けの根拠）
  it("AI が成果物を作る機能は pro", () => {
    const pro = features.filter((f) => f.plan === "pro").map((f) => f.id).sort();
    expect(pro).toEqual(["improvement", "llms-txt", "replies", "reviews", "writing"]);
  });

  it("残りは standard", () => {
    const standard = features.filter((f) => f.plan === "standard").map((f) => f.id);
    expect(standard).toContain("site-audit");
    expect(standard).toContain("search-performance");
    expect(standard).toContain("rank");
    expect(standard.length).toBeGreaterThanOrEqual(9);
  });

  it("プラン一覧のハイライトが実態と矛盾しない", () => {
    // オールインワン（pro）は SEO / AIO / MEO と AI が作る機能をすべて含む、と書いてあること
    const pro = PLANS.find((p) => p.id === "pro")!;
    for (const word of ["SEO", "AIO", "MEO", "AI が作る"]) {
      expect(pro.highlights.some((h) => h.includes(word)), word).toBe(true);
    }
  });

  it("サイドバーに出る機能はすべてプランを持つ", () => {
    for (const group of FEATURE_GROUPS) {
      for (const f of group.features) {
        expect(PLAN_IDS as readonly PlanId[]).toContain(f.plan);
      }
    }
  });
});

describe("売るプランは 1 つ（オールインワン）", () => {
  it("料金表に出るのは無料とオールインワンだけ。standard は内部の段階", () => {
    expect(SELLABLE_PLANS.map((p) => p.id)).toEqual(["free", "pro"]);
    expect(PLAN_BY_ID.pro.label).toBe("オールインワン");
    expect(PLAN_BY_ID.standard.purchasable).toBe(false);
  });

  // standard の機能でも、案内する購入先はオールインワン（standard は売っていない）
  it("案内する購入先は必ず購入できるプラン", () => {
    expect(upgradeTarget("standard").id).toBe("pro");
    expect(upgradeTarget("pro").id).toBe("pro");
    expect(upgradeTarget("free").id).toBe("free");
  });

  it("鍵バッジの短い表示", () => {
    expect(planShortLabel("free")).toBe("無料");
    expect(planShortLabel("standard")).toBe("有料");
    expect(planShortLabel("pro")).toBe("有料");
  });
});

describe("Clerk Billing（Stripe）のプラン識別子", () => {
  // Clerk ダッシュボードで作るプランのスラッグと、この表の id がずれると
  // 「決済は通ったのに機能が開かない」という最悪の壊れ方をする。
  it("すべて user:<プラン id> の形", () => {
    for (const plan of PLANS) {
      expect(plan.clerkPlan, `${plan.id} の clerkPlan`).toBe(`user:${plan.id}`);
    }
  });

  it("clerkPlan を戻すと元のプラン id になる", () => {
    for (const plan of PLANS) {
      expect(toPlanId(plan.clerkPlan)).toBe(plan.id);
    }
  });

  it("プラン id と clerkPlan は一対一", () => {
    const slugs = PLANS.map((p) => p.clerkPlan);
    expect(new Set(slugs).size).toBe(PLANS.length);
  });
});
