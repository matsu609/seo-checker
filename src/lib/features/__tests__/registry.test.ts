/**
 * サイドバーのタブ（AIO / SEO / MEO）の定義を固定するテスト。
 * ツールがどのタブにも出ない（category の付け忘れ）と利用者から見えなくなる。
 */
import { describe, expect, it } from "vitest";
import {
  AIO_CATEGORY,
  categoryForPath,
  DEFAULT_FEATURE_CATEGORY,
  FEATURE_CATEGORIES,
  findCategory,
  groupsForSidebar,
  isPillar,
  sidebarTree,
  TOOL_FEATURES,
  toolGroupsForDisplay,
  type FeatureCategoryId,
} from "../registry";

const ids = (c?: FeatureCategoryId) => groupsForSidebar(c).tools.flatMap((g) => g.features.map((f) => f.id));

describe("AIO 対策（親）の中の 3 本の柱", () => {
  it("柱は SEO → MEO → サイテーションの順（並びは利用者の指定 2026-09-13）。既定で開くのは先頭", () => {
    expect(FEATURE_CATEGORIES.map((c) => c.id)).toEqual(["seo", "meo", "citation"]);
    expect(DEFAULT_FEATURE_CATEGORY).toBe("seo");
    expect(findCategory("meo").label).toBe("MEO");
    expect(findCategory("aio")).toBe(AIO_CATEGORY);
    // AIO 対策 = SEO + MEO + サイテーション の総称、と分かる説明（利用者の指示 2026-09-17）
    expect(AIO_CATEGORY.description).toMatch(/SEO・MEO・サイテーション/);
  });

  it("サイドバーの木: 親の直下に AI 検索モニタリング、柱の中に各ツール、共通に料金・設定", () => {
    const tree = sidebarTree();
    // r127: 親の直下に月次レポート、SEO にサイト監視、MEO に投稿を足した（継続課金のための定期更新。2026-09-20）
    expect(tree.umbrella.map((f) => f.id)).toEqual(["geo", "reports"]);
    // 並びは「診断 → やること → 成果」（利用者の決定 2026-09-19）
    expect(tree.pillars.map((p) => [p.category.id, p.features.map((f) => f.id)])).toEqual([
      ["seo", ["seo-analysis", "page-improve", "writing", "rank", "monitor"]],
      ["meo", ["maps", "reviews", "posts"]],
      ["citation", ["citations"]],
    ]);
    expect(tree.common.map((f) => f.id)).toEqual(["plans", "settings"]);
    // 木に出るのは hidden でないツールの全部（漏れも重複も無い）
    const inTree = [...tree.umbrella, ...tree.pillars.flatMap((p) => p.features), ...tree.common].map((f) => f.id).sort();
    expect(inTree).toEqual(TOOL_FEATURES.filter((f) => !f.hidden).map((f) => f.id).sort());
  });

  it("設定・料金以外のツールは必ずどれかのタブに属する", () => {
    for (const f of TOOL_FEATURES) {
      if (f.group === "settings") {
        expect(f.category, f.id).toBeUndefined();
      } else {
        expect(["aio", "seo", "meo", "citation"], f.id).toContain(f.category);
      }
    }
  });

  it("groupsForSidebar: 分類ごとの絞り込み（共通の機能は必ず付く）", () => {
    for (const c of [...FEATURE_CATEGORIES, AIO_CATEGORY]) {
      const { tools } = groupsForSidebar(c.id);
      const list = tools.flatMap((g) => g.features.map((f) => f.id));
      expect(list.length, c.id).toBeGreaterThan(2);
      expect(list).toContain("settings");
      expect(list).toContain("plans");
      for (const g of tools) for (const f of g.features) expect(f.category ?? c.id, f.id).toBe(c.id);
    }
    expect(ids("seo")).not.toContain("citations");
    expect(ids("citation")).not.toContain("improvement");
  });

  it("サイドバーから外した機能（ページは転送か、親ツールからリンク）はどのタブにも出ない", () => {
    // サイト診断 → 精密診断に統合（2026-09-15）
    // ページ最適化レポート → クイック診断 + HP 改修提案、AIO 頻出トピック → AI 検索モニタリング、
    // プロンプト拡張 → AI 検索モニタリングの設定からリンク（利用者の指示 2026-09-17「本当に必要な機能に絞る」）
    // LLMO モニタリング → AI 検索モニタリングに一本化して引退（2026-09-17）
    for (const id of ["site-audit", "page-report", "aio-topics", "prompt-expansion", "llmo"]) {
      expect(ids(), id).not.toContain(id);
      expect(toolGroupsForDisplay().flatMap((g) => g.features.map((f) => f.id)), id).not.toContain(id);
    }
    // 定義そのものは残す（プランのゲートと PageHeader が引く）
    expect(TOOL_FEATURES.map((f) => f.id)).toContain("prompt-expansion");
  });

  it("パスからタブを引く。共通の画面と無料診断は null", () => {
    expect(categoryForPath("/tools/maps")).toBe("meo");
    expect(categoryForPath("/tools/maps/")).toBe("meo");
    expect(categoryForPath("/tools/geo")).toBe("aio");
    expect(categoryForPath("/tools/citations")).toBe("citation");
    expect(categoryForPath("/tools/listings")).toBe("citation");
    expect(isPillar(categoryForPath("/tools/citations"))).toBe(true);
    expect(isPillar(categoryForPath("/tools/geo"))).toBe(false);
    expect(isPillar(null)).toBe(false);
    expect(categoryForPath("/tools/improvement")).toBe("seo");
    expect(categoryForPath("/tools/site-audit")).toBe("seo");
    expect(categoryForPath("/settings")).toBeNull();
    expect(categoryForPath("/")).toBeNull();
    expect(categoryForPath("/nowhere")).toBeNull();
  });

  it("category を渡さなければ従来どおり全グループ", () => {
    const all = ids();
    expect(all).toEqual(TOOL_FEATURES.filter((f) => !f.hidden).map((f) => f.id));
  });
});
