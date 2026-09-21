/**
 * 設計書（/admin/design）のデータを固定するテスト。
 * 連携を足したのに説明が無い・資料のパスが実在しない、を防ぐ。
 */
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INTEGRATION_KEYS } from "@/lib/features/integrations";
import { blueprintFeatures, blueprintKeys, DESIGN_DOCS, dependencyLevel, docUrl, featuresUsing, matrixColumns, RETIRED, SERVICE_BLUEPRINTS } from "../blueprint";

describe("サービスごとの説明", () => {
  it("外部連携の全部に説明・使う機能・設定の場所がある", () => {
    expect(blueprintKeys()).toEqual(INTEGRATION_KEYS);
    for (const key of INTEGRATION_KEYS) {
      const b = SERVICE_BLUEPRINTS[key];
      expect(b.key).toBe(key);
      expect(b.role.length).toBeGreaterThan(10);
      expect(b.usedFor.length).toBeGreaterThan(0);
      expect(b.configuredAt.length).toBeGreaterThan(3);
    }
  });
});

describe("機能 × 連携", () => {
  it("registry の requires / requiresAny / optional をそのまま読む", () => {
    const seo = blueprintFeatures().find((f) => f.id === "seo-analysis")!;
    expect(dependencyLevel(seo, "anthropic")).toBe("required");
    expect(dependencyLevel(seo, "serpapi")).toBe("optional");
    expect(dependencyLevel(seo, "stripe")).toBeNull();
    const pd = blueprintFeatures().find((f) => f.id === "page-improve")!;
    expect(dependencyLevel(pd, "serpapi")).toBe("any");
  });

  it("Claude を使う機能には精密診断とクイック診断（任意）が入る", () => {
    const ids = featuresUsing("anthropic").map((x) => `${x.feature.id}:${x.level}`);
    expect(ids).toContain("seo-analysis:required");
    expect(ids).toContain("free:optional");
  });

  it("表の列は、どこかの機能が依存している連携だけ（基盤は列にしない）", () => {
    const cols = matrixColumns();
    expect(cols).toContain("anthropic");
    expect(cols).toContain("places");
    expect(cols).not.toContain("vercel");
    expect(cols).not.toContain("onamae");
  });

  it("引退した機能（hidden）は設計書の機能一覧に出さない", () => {
    expect(blueprintFeatures().some((f) => f.hidden)).toBe(false);
    expect(blueprintFeatures().map((f) => f.id)).toContain("free-meo");
  });
});

describe("資料と経緯", () => {
  it("設計資料のパスはリポジトリに実在する", () => {
    for (const d of DESIGN_DOCS) expect(existsSync(d.file), d.file).toBe(true);
    expect(docUrl(DESIGN_DOCS[0]!)).toBe("https://github.com/matsu609/seo-checker/blob/main/docs/dev/OPERATIONS.md");
  });
  it("やめたものには理由と代わりが書いてある", () => {
    expect(RETIRED.length).toBeGreaterThan(3);
    for (const r of RETIRED) {
      expect(r.why.length).toBeGreaterThan(5);
      expect(r.replacedBy.length).toBeGreaterThan(2);
    }
  });
});
