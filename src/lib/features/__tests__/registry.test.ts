/**
 * サイドバーのタブ（AIO / SEO / MEO）の定義を固定するテスト。
 * ツールがどのタブにも出ない（category の付け忘れ）と利用者から見えなくなる。
 */
import { describe, expect, it } from "vitest";
import {
  categoryForPath,
  DEFAULT_FEATURE_CATEGORY,
  FEATURE_CATEGORIES,
  findCategory,
  groupsForSidebar,
  TOOL_FEATURES,
  toolGroupsForDisplay,
} from "../registry";

const ids = (c?: "seo" | "aio" | "meo") => groupsForSidebar(c).tools.flatMap((g) => g.features.map((f) => f.id));

describe("タブの定義", () => {
  it("SEO → MEO → AIO の順に 3 つ（利用者の指定 2026-09-13）。既定は先頭のタブ", () => {
    expect(FEATURE_CATEGORIES.map((c) => c.id)).toEqual(["seo", "meo", "aio"]);
    expect(DEFAULT_FEATURE_CATEGORY).toBe("seo");
    expect(findCategory("meo").label).toBe("MEO");
    // AIO 対策 = SEO + MEO + サイテーション（NAP 登録）の総称、と分かる説明
    expect(findCategory("aio").description).toMatch(/SEO・MEO・サイテーション/);
  });

  it("設定・料金以外のツールは必ずどれかのタブに属する", () => {
    for (const f of TOOL_FEATURES) {
      if (f.group === "settings") {
        expect(f.category, f.id).toBeUndefined();
      } else {
        expect(["seo", "aio", "meo"], f.id).toContain(f.category);
      }
    }
  });

  it("どのタブも空でなく、共通の機能（設定）はすべてのタブに出る", () => {
    for (const c of FEATURE_CATEGORIES) {
      const { tools } = groupsForSidebar(c.id);
      const list = tools.flatMap((g) => g.features.map((f) => f.id));
      expect(list.length, c.id).toBeGreaterThan(2);
      expect(list).toContain("settings");
      expect(list).toContain("plans");
      // 他のタブの機能は混ざらない
      for (const g of tools) for (const f of g.features) expect(f.category ?? c.id, f.id).toBe(c.id);
    }
  });

  it("AIO タブ = 基礎対策（サイテーション・NAP 登録・llms.txt）+ AI 検索モニタリング", () => {
    expect(ids("aio")).toEqual(["citations", "listings", "llms-txt", "geo", "plans", "settings"]);
    // 基礎対策は AIO タブの先頭のグループ
    expect(groupsForSidebar("aio").tools[0]?.id).toBe("foundation");
  });

  it("SEO タブ = お客様のホームページの最適化（HP 改修提案は AIO から移動。利用者の指示 2026-09-17）", () => {
    expect(ids("seo")).toEqual(["seo-analysis", "page-diagnosis", "improvement", "rank", "search-estimate", "keywords", "writing", "plans", "settings"]);
    expect(ids("aio")).not.toContain("improvement");
  });

  it("MEO タブ = Google マップ・口コミ", () => {
    expect(ids("meo")).toEqual(["maps", "reviews", "replies", "plans", "settings"]);
    expect(ids("meo")).not.toContain("seo-analysis");
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
    expect(categoryForPath("/tools/citations")).toBe("aio");
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
