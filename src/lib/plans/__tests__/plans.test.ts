/**
 * プラン判定の回帰テスト。
 * ここが崩れると「有料機能が無料で使える」か「契約者が使えない」のどちらかになる。
 */
import { describe, expect, it } from "vitest";
import { features, FEATURE_GROUPS, groupsForSidebar } from "@/lib/features/registry";
import {
  LISTED_PLANS,
  PLANS,
  PLAN_BY_ID,
  PLAN_IDS,
  PLAN_RANK,
  RECOMMENDED_PLAN,
  STRIPE_PLANS,
  planAllows,
  planPriceLabel,
  planShortLabel,
  toPlanId,
  upgradeTarget,
  type PlanId,
} from "../catalog";

describe("プランの順位", () => {
  it("上位プランは下位の機能をすべて使える", () => {
    expect(planAllows("premium", "free")).toBe(true);
    expect(planAllows("premium", "light")).toBe(true);
    expect(planAllows("premium", "standard")).toBe(true);
    expect(planAllows("standard", "light")).toBe(true);
    expect(planAllows("light", "free")).toBe(true);
  });

  it("下位プランは上位の機能を使えない", () => {
    expect(planAllows("free", "light")).toBe(false);
    expect(planAllows("free", "standard")).toBe(false);
    expect(planAllows("light", "standard")).toBe(false);
    expect(planAllows("standard", "premium")).toBe(false);
  });

  it("順位に重複が無い", () => {
    const ranks = PLAN_IDS.map((id) => PLAN_RANK[id]);
    expect(new Set(ranks).size).toBe(PLAN_IDS.length);
  });
});

describe("プラン ID の正規化", () => {
  it("Clerk の接頭辞つきでも受ける", () => {
    expect(toPlanId("user:standard")).toBe("standard");
    expect(toPlanId("org:light")).toBe("light");
    expect(toPlanId("PREMIUM")).toBe("premium");
    expect(toPlanId(" free ")).toBe("free");
  });

  // 2026-09-15 の 3 段階化より前の値。Vercel の DEFAULT_PLAN=pro や Clerk に残っていても動くこと
  it("旧 ID の pro は今のスタンダードとして読む", () => {
    expect(toPlanId("pro")).toBe("standard");
    expect(toPlanId("user:pro")).toBe("standard");
  });

  // 知らない値を勝手に上位プランへ倒さない
  it("知らない値は null", () => {
    expect(toPlanId("enterprise")).toBeNull();
    expect(toPlanId("")).toBeNull();
    expect(toPlanId(null)).toBeNull();
    expect(toPlanId(123)).toBeNull();
    expect(toPlanId({ plan: "standard" })).toBeNull();
  });
});

describe("価格の表示", () => {
  it("金額どおりに出す", () => {
    expect(planPriceLabel("free")).toBe("無料");
    expect(planPriceLabel("light")).toBe("月額 38,000 円");
    expect(planPriceLabel("standard")).toBe("月額 50,000 円");
    // プレミアムは下限だけを出す（定額に見せない）
    expect(planPriceLabel("premium")).toBe("月額 150,000 円〜");
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

  /**
   * AI が成果物を作る機能はスタンダードに置く。これがライトとの差 12,000 円の中身。
   * `geo`（AI 検索モニタリング）だけは「測る」系だが、1 アカウント月 ¥2,000 前後の
   * 変動費が出るためスタンダードに置いている（ライトに下ろすなら料金表も直す）。
   */
  it("AI が成果物を作る機能はスタンダード", () => {
    const standard = features.filter((f) => f.plan === "standard").map((f) => f.id).sort();
    // r127: 投稿（AI が本文を作って Google に送る）もスタンダード。サイト監視と月次レポートは「読む・測る」系なのでライト
    expect(standard).toEqual(["geo", "improvement", "listings", "llms-txt", "posts", "replies", "reviews", "seo-analysis", "writing"]);
  });

  it("読む・測る系はライト", () => {
    const light = features.filter((f) => f.plan === "light").map((f) => f.id);
    expect(light).toContain("site-audit");
    expect(light).toContain("rank");
    // Search Console / GA4 は使わない（利用者の決定 2026-09-17）。ライトには連携の要らない代替を置く
    expect(light).toContain("search-estimate");
    // サイテーション（ウェブ上の掲載・言及チェック）は読む・測る系なのでライト（2026-09-17）
    expect(light).toContain("citations");
    // NAP チェック（表記ゆれの検出）も読む・測る系（2026-09-20）
    expect(light).toContain("nap");
    expect(light).not.toContain("search-performance");
    expect(light.length).toBeGreaterThanOrEqual(9);
  });

  /**
   * プレミアムは人の作業を足す段。ツールのゲートには使わない（利用者の決定 2026-09-17）。
   * 以前プレミアムに置いていた Search Console / GA4 の 3 ツールは提供を終了した
   * （Google の無料ツールは使わない）。registry から消えていることをここで固定する。
   */
  it("プレミアム限定のツールは無い（Search Console / GA4 のツールは提供終了）", () => {
    expect(features.filter((f) => f.plan === "premium")).toEqual([]);
    const ids = features.map((f) => f.id);
    expect(ids).not.toContain("search-performance");
    expect(ids).not.toContain("site-report");
    expect(ids).not.toContain("ai-traffic");
    expect(groupsForSidebar().tools.flatMap((g) => g.features.map((f) => f.plan))).not.toContain("premium");
  });

  // 自前の計測タグ（アクセス解析）は「お客様がタグを貼る = ツール内で完結しない」ので取り下げた（利用者の決定 2026-09-17）
  it("お客様側の作業が要るツールは置かない（計測タグは取り下げ）", () => {
    expect(features.map((f) => f.id)).not.toContain("analytics");
  });

  // 連携なしで数字が出る代替をライトに置く。ここが無いと「契約初日に何も出ない」になる
  it("Search Console の代替（推定）はライトで、連携を必要としない", () => {
    const estimate = features.find((f) => f.id === "search-estimate");
    expect(estimate?.plan).toBe("light");
    // 2026-09-19 に「順位計測」のタブへ統合したのでサイドバーには出さない。
    // プランのゲート（/api/search-estimate）はこの ID のままなので、定義は残す
    expect(estimate?.hidden).toBe(true);
    // お客様の Google 連携ではなく、運営者の DataForSEO だけで動く
    expect(estimate?.requires).toEqual(["dataforseo"]);
    // 入口になった順位計測も同じライト（タブを開いた先で急に鍵がかからない）
    expect(features.find((f) => f.id === "rank")?.plan).toBe("light");
  });

  it("プラン一覧のハイライトが実態と矛盾しない", () => {
    // ライトは AI が作るツールを含まないことを必ず書く（買ってから気づく形にしない）
    expect(PLAN_BY_ID.light.highlights.some((h) => h.includes("含みません"))).toBe(true);
    // スタンダードはライトとの差額を書く（3 段階にした意味がここに出る）
    expect(PLAN_BY_ID.standard.highlights.some((h) => h.includes("12,000 円"))).toBe(true);
  });

  it("サイドバーに出る機能はすべてプランを持つ", () => {
    for (const group of FEATURE_GROUPS) {
      for (const f of group.features) {
        expect(PLAN_IDS as readonly PlanId[]).toContain(f.plan);
      }
    }
  });
});

describe("売るのは 3 段階（ライト / スタンダード / プレミアム）", () => {
  it("料金表は安い順（左からライト → スタンダード → プレミアム）。未契約は出さない", () => {
    expect(LISTED_PLANS.map((p) => p.id)).toEqual(["light", "standard", "premium"]);
  });

  it("画面から買えるのはライトとスタンダードだけ。プレミアムは問い合わせ", () => {
    expect(STRIPE_PLANS.map((p) => p.id)).toEqual(["light", "standard"]);
    expect(PLAN_BY_ID.premium.checkout).toBe("contact");
    expect(PLAN_BY_ID.free.checkout).toBe("none");
  });

  // 定額に見せると、重い案件をその額で受けざるを得なくなる。下限 +「〜」+ お見積りの断りをそろえる
  it("お見積りのプランは下限として出し、買えるプランは定額のまま", () => {
    expect(PLAN_BY_ID.premium.priceFrom).toBe(true);
    expect(PLAN_BY_ID.premium.limitNote).toContain("お見積り");
    expect(PLAN_BY_ID.premium.highlights.some((h) => h.includes("お見積り") || h.includes("ご相談"))).toBe(true);
    for (const plan of STRIPE_PLANS) {
      expect(plan.priceFrom, `${plan.id} は定額で売る`).toBeUndefined();
    }
  });

  // 本命は真ん中の 1 つだけ（極端回避性。2 つ強調すると効かない）
  it("本命はスタンダード 1 つだけ", () => {
    expect(RECOMMENDED_PLAN.id).toBe("standard");
    expect(PLANS.filter((p) => p.recommended)).toHaveLength(1);
  });

  // 値段の並びが崩れると松竹梅にならない
  it("ライト < スタンダード < プレミアム", () => {
    expect(PLAN_BY_ID.light.priceYen).toBeLessThan(PLAN_BY_ID.standard.priceYen);
    expect(PLAN_BY_ID.standard.priceYen).toBeLessThan(PLAN_BY_ID.premium.priceYen);
  });

  it("案内する購入先は必ず画面から買えるプラン", () => {
    expect(upgradeTarget("light").id).toBe("light");
    expect(upgradeTarget("standard").id).toBe("standard");
    // プレミアムは買えないので、そのまま返して問い合わせに案内する
    expect(upgradeTarget("premium").id).toBe("premium");
  });

  it("鍵バッジの短い表示", () => {
    expect(planShortLabel("free")).toBe("無料");
    expect(planShortLabel("light")).toBe("有料");
    expect(planShortLabel("standard")).toBe("有料");
    expect(planShortLabel("premium")).toBe("有料");
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
