import { describe, expect, it } from "vitest";
import { ORIGIN, html, pageFrom } from "@/lib/audit/__tests__/fixtures";
import { applyDepths, buildResult } from "@/lib/audit/run";
import type { AuditResult } from "@/lib/audit/types";
import { scoreDomainPower } from "@/lib/domain-power";
import { buildFactSheet, factsFromAudit, factsToLines, pickKeyPages } from "../sheet/build";
import type { AnalysisInput, SheetGoogle, SheetSearch, SheetSpeed } from "../sheet/types";

function audit(): AuditResult {
  const pages = [
    pageFrom(html({ head: "<title>サンプル工房 | ウェブ制作</title>", body: `<nav><a href="/service">サービス</a><a href="/contact">お問い合わせ</a></nav><main><h1>トップ</h1><p>TEL 03-1234-5678 <a href="/blog/post-1">記事</a></p></main>` }), { url: `${ORIGIN}/`, finalUrl: `${ORIGIN}/` }),
    pageFrom(html({ head: "<title>サービス</title>", body: `<main><h1>サービス</h1><p><a href="/contact">お問い合わせ</a></p></main>` }), { url: `${ORIGIN}/service`, finalUrl: `${ORIGIN}/service` }),
    pageFrom(html({ head: "<title>お問い合わせ</title>", body: `<main><h1>お問い合わせ</h1></main>` }), { url: `${ORIGIN}/contact`, finalUrl: `${ORIGIN}/contact` }),
    pageFrom(html({ head: "<title>記事</title>", body: `<main><h1>記事</h1></main>` }), { url: `${ORIGIN}/blog/post-1`, finalUrl: `${ORIGIN}/blog/post-1` }),
  ];
  applyDepths(pages, `${ORIGIN}/`);
  return buildResult({
    startUrl: `${ORIGIN}/`,
    origin: ORIGIN,
    crawledAt: "2026-09-14T00:00:00.000Z",
    pages,
    issues: [
      { ruleId: "META_DESC_MISSING", category: "メタタグ", severity: "warning", url: `${ORIGIN}/`, detail: "x", suggestion: "y" },
      { ruleId: "META_DESC_MISSING", category: "メタタグ", severity: "warning", url: `${ORIGIN}/service`, detail: "x", suggestion: "y" },
      { ruleId: "H1_MISSING", category: "見出しタグ", severity: "error", url: `${ORIGIN}/contact`, detail: "x", suggestion: "y" },
    ],
    crawlStats: { discovered: 4, fetched: 4, analyzed: 4, failed: 0, skipped: 0, durationMs: 10, maxPages: 100, truncated: null, sitemapCount: 4, linkCount: 0, probed: 0, timed: 1 },
    failures: [],
    notes: [],
  });
}

const input: AnalysisInput = { url: `${ORIGIN}/`, keywords: ["ウェブ制作 世田谷"], industry: "制作会社", goal: "inquiry", region: "世田谷区", competitors: [], brand: "", maxPages: 100 };

const speed: SheetSpeed = {
  psi: [{ url: `${ORIGIN}/`, label: "トップ", result: { requestedUrl: `${ORIGIN}/`, finalUrl: `${ORIGIN}/`, strategy: "mobile", fetchedAt: "2026-09-14", categories: { performance: 62, accessibility: 90, seo: 100 }, crux: null, lab: { lcp: 3400, cls: 0.02, fcp: 1500, tbt: 250 }, opportunities: [{ id: "x", title: "画像の最適化", score: 0.4, displayValue: "1.2 秒", description: "" }], usedApiKey: true }, error: null }],
  crux: {
    origin: { scope: "origin", key: ORIGIN, period: { firstDate: "2026-08-10", lastDate: "2026-09-06" }, metrics: { lcp: { p75: 2800, status: "needs-improvement", histogram: [0.7, 0.2, 0.1] }, inp: { p75: 150, status: "good", histogram: [0.9, 0.08, 0.02] }, cls: { p75: 0.05, status: "good", histogram: [0.95, 0.04, 0.01] } }, passesCoreWebVitals: false },
    originFailure: null,
    history: { scope: "origin", key: ORIGIN, metrics: { lcp: [{ date: "2026-07-01", p75: 3100 }, { date: "2026-09-06", p75: 2800 }] } },
    urls: [{ url: `${ORIGIN}/`, record: null, failure: "no-data" }],
  },
  notes: [],
};
const search: SheetSearch = { keywords: [{ keyword: "ウェブ制作 世田谷", rank: 12, url: `${ORIGIN}/service`, topDomains: ["a.jp", "b.jp", "c.jp"], features: ["ai_overview", "local_pack"], aiOverview: true, ownCited: false, competitors: [] }], siteCount: 38, brand: { query: "サンプル工房", rank: 1, url: `${ORIGIN}/` }, notes: [] };
const google: SheetGoogle = { searchConsole: null, ga4: null, notes: ["Search Console は連携していません"] };
const domain = scoreDomainPower({
  host: "example.com",
  ahrefsDr: 18,
  openPageRank: 3.4,
  openPageRankWorldRank: 1_234_567,
  registeredAt: "2015-04-01T00:00:00.000Z",
  indexedPages: 38,
  brandRank: 1,
  brandMeasured: true,
  keywordRanks: [12],
  cruxCoverage: "origin",
  crawledPages: 4,
  internalLinks: 5,
  trust: { pass: 3, total: 9 },
  https: false,
  peers: [{ host: "competitor.jp", ahrefsDr: 34, openPageRank: 4.1, registeredAt: "2010-01-01T00:00:00.000Z", ageYears: 16.7 }],
  sources: { ahrefs: true, openPageRank: true, rdap: true, serp: true, crux: true },
  now: new Date("2026-09-14T00:00:00.000Z"),
});

describe("事実シート", () => {
  const sheet = buildFactSheet({ input, audit: audit(), quick: { score: 72, categories: [{ id: "meta", label: "メタ情報", score: 60 }] }, speed, search, domain, google, coverage: { psi: true, crux: true, serp: true, searchConsole: false, ga4: false, domainPower: true }, generatedAt: "2026-09-14T00:00:00.000Z" });

  it("領域ごとに ID を振り、値と補足を持つ", () => {
    const ids = sheet.facts.map((f) => f.id);
    expect(ids[0]).toBe("I-01");
    expect(ids).toContain("C-01");
    expect(ids).toContain("S-01");
    expect(ids).toContain("T-01");
    expect(ids).toContain("P-01");
    expect(ids).toContain("R-01");
    expect(ids).toContain("D-01");
    expect(new Set(ids).size).toBe(ids.length);
    const rule = sheet.facts.find((f) => f.label === "課題: META_DESC_MISSING")!;
    expect(rule.value).toContain("2 件");
    expect(rule.note).toContain("/service");
  });

  it("速度・検索・信頼の事実を文章にする", () => {
    const lines = factsToLines(sheet.facts);
    expect(lines.some((l) => l.includes("LCP 2.8 秒（改善が必要）") && l.includes("Core Web Vitals 不合格"))).toBe(true);
    expect(lines.some((l) => l.includes("LCP") && l.includes("3.1 秒 → 2.8 秒（改善）"))).toBe(true);
    expect(lines.some((l) => l.includes("順位: 「ウェブ制作 世田谷」: 12 位") && l.includes("AI Overviews あり（自社の引用 なし）"))).toBe(true);
    expect(lines.some((l) => l.includes("site: 検索") && l.includes("約 38 件"))).toBe(true);
    expect(lines.some((l) => l.includes("会社・店舗情報のページ: 未対応"))).toBe(true);
    expect(lines.some((l) => l.includes("クイック診断の総合スコア") && l.includes("72 点"))).toBe(true);
    expect(lines.some((l) => l.includes("URL 単位のデータ不足"))).toBe(true);
    expect(lines.some((l) => l.includes("注記: Search Console は連携していません"))).toBe(true);
  });

  it("ドメインパワーを内訳つきで事実にする", () => {
    const lines = factsToLines(sheet.facts);
    expect(lines.some((l) => l.includes("ドメインパワー（推定）") && l.includes("点 / 100"))).toBe(true);
    expect(lines.some((l) => l.includes("外部からのリンクの評価") && l.includes("DR 18 / 100"))).toBe(true);
    expect(lines.some((l) => l.includes("ドメインの年数") && l.includes("11.5 年"))).toBe(true);
    expect(lines.some((l) => l.includes("競合のドメイン: competitor.jp"))).toBe(true);
  });

  it("ページ一覧は落とし、上位・弱いページだけ残す", () => {
    expect("pages" in sheet.site.structure).toBe(false);
    expect(sheet.site.topRules[0].ruleId).toBe("META_DESC_MISSING");
  });

  it("サイト診断だけからも facts を作れる（画面ごとの AI 分析用）", () => {
    const facts = factsFromAudit(audit());
    expect(facts.some((f) => f.area === "structure")).toBe(true);
    expect(facts.some((f) => f.area === "trust")).toBe(true);
    expect(facts.some((f) => f.area === "speed")).toBe(false);
    expect(facts.filter((f) => f.area === "input")).toHaveLength(1);
  });

  it("主要ページはトップ + 重要度順", () => {
    const rows = audit().pages;
    const picked = pickKeyPages(rows, `${ORIGIN}/`, 3);
    expect(picked[0]).toEqual({ url: `${ORIGIN}/`, label: "トップ" });
    expect(picked).toHaveLength(3);
    expect(picked[1].label).toMatch(/^重要度 1 位/);
  });
});
