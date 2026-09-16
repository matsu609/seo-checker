/** 診断結果が事実シートに載り、AI が引用できる形になっているか */
import { describe, expect, it } from "vitest";
import { ORIGIN as AUDIT_ORIGIN, html, pageFrom } from "@/lib/audit/__tests__/fixtures";
import { applyDepths, buildResult } from "@/lib/audit/run";
import type { AuditResult } from "@/lib/audit/types";
import { buildFactSheet, factsToLines } from "@/lib/seo-analysis/sheet/build";
import type { AnalysisInput, SheetGoogle, SheetSearch, SheetSpeed } from "@/lib/seo-analysis/sheet/types";
import { runDiagnosis } from "../engine";
import { dataset, metrics, row } from "./fixtures";

function audit(): AuditResult {
  const pages = [pageFrom(html({ head: "<title>サンプル商事</title>", body: "<main><h1>トップ</h1></main>" }), { url: `${AUDIT_ORIGIN}/`, finalUrl: `${AUDIT_ORIGIN}/` })];
  applyDepths(pages, `${AUDIT_ORIGIN}/`);
  return buildResult({
    startUrl: `${AUDIT_ORIGIN}/`,
    origin: AUDIT_ORIGIN,
    crawledAt: "2026-09-15T00:00:00.000Z",
    pages,
    issues: [],
    crawlStats: { discovered: 1, fetched: 1, analyzed: 1, failed: 0, skipped: 0, durationMs: 10, maxPages: 100, truncated: null, sitemapCount: 1, linkCount: 0, probed: 0, timed: 1 },
    failures: [],
    notes: [],
  });
}

const input: AnalysisInput = { url: `${AUDIT_ORIGIN}/`, keywords: [], industry: "", goal: "inquiry", region: "", competitors: [], brand: "サンプル商事", maxPages: 100 };
const speed: SheetSpeed = { psi: [], crux: { origin: null, originFailure: null, history: null, urls: [] }, notes: [] };
const search: SheetSearch = { keywords: [], siteCount: null, brand: null, notes: [] };
const google: SheetGoogle = { searchConsole: null, ga4: null, notes: [] };

function sheetWith(diagnosis: ReturnType<typeof runDiagnosis> | null) {
  return buildFactSheet({
    input,
    audit: audit(),
    quick: null,
    speed,
    search,
    domain: null,
    llms: null,
    google,
    diagnosis,
    coverage: { psi: false, crux: false, serp: false, searchConsole: diagnosis?.summary !== null, ga4: false, diagnosis: diagnosis?.summary !== null },
  });
}

describe("事実シートへの取り込み", () => {
  const diagnosis = runDiagnosis({
    origin: AUDIT_ORIGIN,
    goal: "inquiry",
    brandTerms: ["サンプル商事"],
    gsc: dataset({
      totals: { current: metrics(286, 7560, 12.5), previous: metrics(280, 5600, 12.5) },
      queries: { current: [row("サンプル商事", 240, 400, 1.2), row("看板 製作", 46, 7160, 14)] },
    }),
    ga4: null,
  });

  it("発火したルールが N-◯◯ の事実として載る", () => {
    const sheet = sheetWith(diagnosis);
    const facts = sheet.facts.filter((f) => f.area === "diagnosis");
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.id.startsWith("N-"))).toBe(true);
    expect(facts.some((f) => f.label.includes("T02"))).toBe(true);
  });

  it("根拠の数値と「言ってはいけないこと」が同じ行に入る", () => {
    const sheet = sheetWith(diagnosis);
    const t02 = sheet.facts.find((f) => f.label.includes("T02"))!;
    expect(t02.value).toContain("表示回数");
    expect(t02.note).toContain("書いてはいけないこと");
  });

  it("判定できなかったことも事実として載る", () => {
    const sheet = sheetWith(diagnosis);
    expect(sheet.facts.some((f) => f.area === "diagnosis" && f.label === "判定できなかったこと")).toBe(true);
  });

  it("プロンプト用の行に変換できる", () => {
    const sheet = sheetWith(diagnosis);
    const lines = factsToLines(sheet.facts.filter((f) => f.area === "diagnosis"));
    expect(lines[0]).toMatch(/^N-01 \[数字の診断/);
  });

  it("診断が無い保存分（古い行）でも事実シートは作れる", () => {
    const sheet = sheetWith(null);
    expect(sheet.diagnosis).toBeNull();
    expect(sheet.facts.some((f) => f.area === "diagnosis")).toBe(false);
  });

  it("事実 ID が領域をまたいで重複しない", () => {
    const sheet = sheetWith(diagnosis);
    const ids = sheet.facts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
