import { describe, expect, it } from "vitest";
import { diffSheets } from "../diff";
import type { SeoFactSheet } from "../sheet/types";

function sheet(over: Partial<{ quick: number | null; error: number; warning: number; rules: [string, number][]; ranks: [string, number | null][]; psi: [string, string, number | null][]; dr: number | null; llms: boolean | null; trust: [string, string, "pass" | "warn" | "fail" | "info"][] }> = {}): SeoFactSheet {
  const s = {
    quick: 60,
    error: 3,
    warning: 10,
    rules: [["missing-title", 2]] as [string, number][],
    ranks: [["美容院 渋谷", 12]] as [string, number | null][],
    psi: [["https://x.jp/", "トップ", 40]] as [string, string, number | null][],
    dr: 10,
    llms: false,
    trust: [["company", "会社情報", "fail"]] as [string, string, "pass" | "warn" | "fail" | "info"][],
    ...over,
  };
  return {
    version: 1,
    generatedAt: "2026-09-01T00:00:00Z",
    input: { url: "https://x.jp/", keywords: [], industry: "", goal: "other", region: "", competitors: [], brand: "", maxPages: 200 },
    site: {
      origin: "https://x.jp",
      startUrl: "https://x.jp/",
      crawledAt: "",
      crawl: {} as never,
      bySeverity: { error: s.error, warning: s.warning, info: 0 },
      byCategory: [],
      topRules: s.rules.map(([ruleId, count]) => ({ ruleId, category: "meta" as never, severity: "error" as const, count, examples: [] })),
      structure: {} as never,
      trust: { pages: {} as never, organization: null, nap: {} as never, contact: {} as never, author: {} as never, checks: s.trust.map(([id, label, status]) => ({ id, label, status, detail: "" })) },
      quick: s.quick === null ? null : { score: s.quick, categories: [] },
    },
    speed: { psi: s.psi.map(([url, label, performance]) => ({ url, label, result: performance === null ? null : ({ categories: { performance, accessibility: null, seo: null } } as never), error: null })), crux: { origin: null, originFailure: null, history: null, urls: [] }, notes: [] },
    search: { keywords: s.ranks.map(([keyword, rank]) => ({ keyword, rank, url: null, topDomains: [], features: [], aiOverview: false, ownCited: null, competitors: [] })), siteCount: null, brand: null, notes: [] },
    domain: s.dr === null ? null : ({ ahrefsDr: s.dr } as never),
    llms: s.llms === null ? null : ({ present: s.llms } as never),
    google: { searchConsole: null, ga4: null, notes: [] },
    coverage: { psi: true, crux: false, serp: true },
    facts: [],
  };
}

describe("精密診断の差分", () => {
  it("変化が無ければ headline だけ", () => {
    const d = diffSheets(sheet(), { ...sheet(), generatedAt: "2026-10-01T00:00:00Z" });
    expect(d.improved).toEqual([]);
    expect(d.worsened).toEqual([]);
    expect(d.headline).toBe("前回から大きな変化はありません");
    expect(d.same.length).toBeGreaterThan(0);
  });

  it("直った点と悪化した点を数える（採点・課題・順位・速度・DR・llms.txt・信頼）", () => {
    const next = { ...sheet({ quick: 70, error: 1, warning: 12, rules: [["broken-link", 4]], ranks: [["美容院 渋谷", null]], psi: [["https://x.jp/", "トップ", 55]], dr: 12, llms: true, trust: [["company", "会社情報", "pass"]] }), generatedAt: "2026-10-01T00:00:00Z" };
    const d = diffSheets(sheet(), next);
    const improved = d.improved.map((i) => i.label);
    const worsened = d.worsened.map((i) => i.label);
    expect(improved).toEqual(expect.arrayContaining(["トップページの採点（クイック診断）", "重大な課題", "課題「missing-title」が無くなった", "速度「トップ」（PageSpeed）", "Ahrefs DR", "llms.txt", "信頼「会社情報」"]));
    expect(worsened).toEqual(expect.arrayContaining(["警告", "課題「broken-link」が新しく出た", "順位「美容院 渋谷」"]));
    const rank = d.worsened.find((i) => i.label === "順位「美容院 渋谷」");
    expect(rank).toMatchObject({ before: "12 位", after: "圏外" });
    expect(d.headline).toBe("前回と比べて、直った点 7 件・悪化した点 3 件");
  });

  it("速度は 3 点以内の差なら同じ扱い。片方に無い数字は比べない", () => {
    const d = diffSheets(sheet(), { ...sheet({ psi: [["https://x.jp/", "トップ", 42]], quick: null, dr: null }), generatedAt: "2026-10-01T00:00:00Z" });
    expect(d.same.some((i) => i.label === "速度「トップ」（PageSpeed）")).toBe(true);
    expect([...d.improved, ...d.worsened, ...d.same].some((i) => i.label.startsWith("トップページの採点"))).toBe(false);
  });
});
