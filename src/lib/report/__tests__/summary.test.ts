import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABELS,
  CATEGORY_WEIGHTS,
  type AnalysisResult,
  type CategoryId,
  type CategoryScore,
  type CheckResult,
  type CheckStatus,
  type PageSnapshot,
  type SiteAnalysisResult,
  type SiteCategoryScore,
  type SiteCheckSummary,
  type SitePageResult,
} from "@/lib/analyzer/types";
import { buildPageSummary, buildSiteSummary } from "../summary";
import type { CommentaryLine } from "../types";
import { CATEGORY_ORDER } from "../weights";

// ---------------------------------------------------------------------------
// 手書きのフィクスチャ（ネットワークに出ない）
// ---------------------------------------------------------------------------

const SNAPSHOT: PageSnapshot = {
  url: "https://example.com/",
  finalUrl: "https://example.com/",
  status: 200,
  title: "サンプルサイト",
  description: null,
  lang: "ja",
  mainText: "",
  mainTextLength: 1200,
  rawTextLength: 1500,
  jsonLdTypes: [],
  h1Count: 1,
  fetchedAt: "2026-09-06T05:00:00.000Z",
};

function mkCheck(
  id: string,
  category: CategoryId,
  status: CheckStatus,
  weight: number,
  extra: Partial<CheckResult> = {},
): CheckResult {
  const w = status === "info" ? 0 : weight;
  const earned = status === "pass" ? w : status === "warn" ? w / 2 : 0;
  return { id, category, status, label: `${id} のラベル`, weight: w, earned, ...extra };
}

/** analyzer/scoring.ts と同じ計算でカテゴリを組み立てる */
function mkCategories(checks: CheckResult[]): CategoryScore[] {
  return CATEGORY_ORDER.map((id) => {
    const own = checks.filter((c) => c.category === id);
    const total = own.reduce((s, c) => s + c.weight, 0);
    const earned = own.reduce((s, c) => s + c.earned, 0);
    return {
      id,
      label: CATEGORY_LABELS[id],
      score: total === 0 ? 100 : Math.round((earned / total) * 100),
      checks: own,
    };
  });
}

function overallOf(categories: CategoryScore[]): number {
  const weighted = categories.reduce((s, c) => s + c.score * CATEGORY_WEIGHTS[c.id], 0);
  const total = categories.reduce((s, c) => s + CATEGORY_WEIGHTS[c.id], 0);
  return total === 0 ? 0 : Math.round(weighted / total);
}

function mkPage(checks: CheckResult[]): AnalysisResult {
  const categories = mkCategories(checks);
  return { page: SNAPSHOT, overall: overallOf(categories), categories, notes: [], excluded: null };
}

/** 総合スコアだけを指定したページ結果（グレード閾値の検証用） */
function pageWithOverall(overall: number): AnalysisResult {
  return {
    page: SNAPSHOT,
    overall,
    categories: mkCategories([mkCheck("title", "meta", "pass", 3)]),
    notes: [],
    excluded: null,
  };
}

function mkSitePage(
  url: string,
  scores: Partial<Record<CategoryId, number>>,
  overall?: number,
): SitePageResult {
  const full = Object.fromEntries(
    CATEGORY_ORDER.map((id) => [id, scores[id] ?? 0]),
  ) as Record<CategoryId, number>;
  const weighted =
    CATEGORY_ORDER.reduce((s, id) => s + full[id] * CATEGORY_WEIGHTS[id], 0) / 100;
  return {
    url,
    overall: overall ?? Math.round(weighted),
    scores: full,
    page: { ...SNAPSHOT, url, finalUrl: url },
  };
}

function mkSiteCheck(
  id: string,
  category: CategoryId,
  counts: Partial<Record<CheckStatus, number>>,
  extra: Partial<SiteCheckSummary> = {},
): SiteCheckSummary {
  return {
    id,
    category,
    label: `${id} のラベル`,
    counts: { pass: 0, warn: 0, fail: 0, info: 0, ...counts },
    // summary 側は counts から spread を組み直すので、ここの値は問わない
    spread: "uniform",
    affected: [],
    ...extra,
  };
}

function mkSiteCategories(pages: SitePageResult[]): SiteCategoryScore[] {
  if (pages.length === 0) return [];
  return CATEGORY_ORDER.map((id) => {
    const scored = pages.map((p) => ({ url: p.url, score: p.scores[id] ?? 0 }));
    const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
    return {
      id,
      label: CATEGORY_LABELS[id],
      score: Math.round(scored.reduce((s, x) => s + x.score, 0) / scored.length),
      min: Math.min(...scored.map((s) => s.score)),
      max: Math.max(...scored.map((s) => s.score)),
      worstUrl: worst.url,
    };
  });
}

function mkSite(
  pages: SitePageResult[],
  checks: SiteCheckSummary[],
  extra: Partial<SiteAnalysisResult> = {},
): SiteAnalysisResult {
  const overall =
    pages.length === 0
      ? 0
      : Math.round(pages.reduce((s, p) => s + p.overall, 0) / pages.length);
  return {
    entryUrl: pages[0]?.url ?? "https://example.com/",
    origin: "https://example.com",
    pages,
    failures: [],
    excluded: [],
    overall,
    categories: mkSiteCategories(pages),
    checks,
    discovery: "sitemap",
    crawl: {
      discovered: pages.length,
      fetched: pages.length,
      analyzed: pages.length,
      excluded: 0,
      failed: 0,
      skipped: 0,
      durationMs: 12_000,
      truncated: null,
      sitemapCount: pages.length,
      linkCount: 0,
      maxPages: 300,
    },
    notes: [],
    fetchedAt: "2026-09-06T05:00:00.000Z",
    ...extra,
  };
}

const lineText = (line: CommentaryLine): string =>
  line.map((p) => (typeof p === "string" ? p : p.num)).join("");
const lineNums = (line: CommentaryLine): string[] =>
  line.flatMap((p) => (typeof p === "string" ? [] : [p.num]));

// ---------------------------------------------------------------------------
// PAGE モード
// ---------------------------------------------------------------------------

describe("buildPageSummary", () => {
  const mixed = mkPage([
    mkCheck("title", "meta", "pass", 3),
    mkCheck("description", "meta", "warn", 3),
    mkCheck("canonical", "meta", "fail", 1),
    mkCheck("lang", "meta", "pass", 1),
    mkCheck("jsonld-search-action", "structuredData", "info", 0),
  ]);

  it("判定の件数は項目ごとに数える", () => {
    expect(buildPageSummary(mixed).counts).toEqual({
      pass: 2,
      warn: 1,
      fail: 1,
      info: 1,
      scored: 4,
    });
  });

  it("カテゴリ行は CATEGORY_ORDER 順・配点付きで、判定とグレードを持つ", () => {
    const s = buildPageSummary(mixed);
    expect(s.categories.map((c) => c.id)).toEqual([...CATEGORY_ORDER]);
    expect(s.categories.map((c) => c.weight)).toEqual([20, 25, 20, 15, 20]);
    const meta = s.categories.find((c) => c.id === "meta");
    // 配点 8 のうち獲得 5.5 → 69 点
    expect(meta?.score).toBe(69);
    expect(meta?.tone).toBe("warn");
    expect(meta?.grade.grade).toBe("C");
    expect(s.worst.id).toBe("meta");
    // 同点（100 点）のカテゴリは CATEGORY_ORDER の先頭を採用する
    expect(s.best.id).toBe("crawlers");
  });

  it("優先改善は見込み加点の降順。配点の小さい未対応は大きい未対応より下になる", () => {
    const s = buildPageSummary(
      mkPage([
        // crawlers: 配点計 5 のうち 3 が未対応 → 3 / 5 × 20 = 12 点
        mkCheck("ai-crawlers-allowed", "crawlers", "fail", 3),
        mkCheck("noindex", "crawlers", "pass", 2),
        // meta: 配点計 10 のうち 1 が未対応 → 1 / 10 × 20 = 2 点
        mkCheck("canonical", "meta", "fail", 1),
        mkCheck("title", "meta", "pass", 3),
        mkCheck("description", "meta", "pass", 3),
        mkCheck("ogp", "meta", "pass", 2),
        mkCheck("lang", "meta", "pass", 1),
      ]),
    );
    expect(s.top3.map((i) => i.id)).toEqual(["ai-crawlers-allowed", "canonical"]);
    expect(s.top3[0].gain).toBeCloseTo(12, 6);
    expect(s.top3[0].gainLabel).toBe("+12 点");
    expect(s.top3[0].categoryLabel).toBe(CATEGORY_LABELS.crawlers);
    expect(s.top3[1].gainLabel).toBe("+2 点");
    // 見込み総合 = 現状 + TOP3 の加点
    expect(s.projected).toBe(s.overall + 14);
  });

  it("同点は 未対応 → CATEGORY_ORDER → id の順で並ぶ", () => {
    const s = buildPageSummary(
      mkPage([
        // crawlers（配点計 10）: 改善余地 4 → 2 / 10 × 20 = 4 点
        mkCheck("c-warn", "crawlers", "warn", 4),
        mkCheck("c-pass", "crawlers", "pass", 6),
        // meta（配点計 10）: 未対応 2 → 2 / 10 × 20 = 4 点（同点だが未対応が上）
        mkCheck("m-fail", "meta", "fail", 2),
        mkCheck("m-pass", "meta", "pass", 8),
        // headings（配点計 10）: 未対応 2 が 2 件 → どちらも 3 点。id 昇順
        mkCheck("b-fail", "headings", "fail", 2),
        mkCheck("a-fail", "headings", "fail", 2),
        mkCheck("h-pass", "headings", "pass", 6),
      ]),
    );
    expect(s.improvements.map((i) => i.id)).toEqual(["m-fail", "c-warn", "a-fail", "b-fail"]);
    expect(s.top3).toHaveLength(3);
    expect(s.improvements.length).toBeGreaterThan(s.top3.length);
    // 未対応の項目は見込み加点の順で返す
    expect(s.failedLabels).toEqual([
      "m-fail のラベル",
      "a-fail のラベル",
      "b-fail のラベル",
    ]);
  });

  it("四捨五入して 0 になる見込み加点は「+1 点未満」", () => {
    const checks = [mkCheck("image-alt", "content", "fail", 1)];
    for (let i = 0; i < 99; i += 1) {
      checks.push(mkCheck(`filler-${i}`, "content", "pass", 1));
    }
    const s = buildPageSummary(mkPage(checks));
    // 1 / 100 × 20 = 0.2 点
    expect(s.top3[0].gain).toBeCloseTo(0.2, 6);
    expect(s.top3[0].gainLabel).toBe("+1 点未満");
  });

  it.each([
    [100, "A"],
    [90, "A"],
    [89, "B"],
    [80, "B"],
    [79, "C"],
    [65, "C"],
    [64, "D"],
    [50, "D"],
    [49, "E"],
    [0, "E"],
  ])("総合 %i 点はグレード %s", (overall, grade) => {
    expect(buildPageSummary(pageWithOverall(overall)).grade.grade).toBe(grade);
  });

  it("講評は 3 行で、数値は { num } のパートに分かれている", () => {
    const s = buildPageSummary(mixed);
    expect(s.commentary).toHaveLength(3);
    // 1 行目の文字列パートには数字を直接埋め込まない
    for (const part of s.commentary[0]) {
      if (typeof part === "string") expect(part).not.toMatch(/\d/);
    }
    expect(lineNums(s.commentary[0])).toContain(String(s.overall));
    expect(lineText(s.commentary[0])).toContain(
      `総合 ${s.overall} 点・${s.grade.grade}（${s.grade.label}）です。`,
    );
    expect(lineText(s.commentary[0])).toContain("5 カテゴリで最も評価が高いのは");
    expect(lineText(s.commentary[1])).toBe(
      `最も低いのは${CATEGORY_LABELS.meta}（69 点）で、未対応 1 項目・改善余地 1 項目があります。`,
    );
    expect(lineText(s.commentary[2])).toContain("優先改善");
    expect(lineText(s.commentary[2])).toContain(`${s.projected} 点（${s.projectedGrade.grade}）`);
    for (const line of s.commentary) {
      expect(lineText(line)).not.toMatch(/危険|致命的|重大/);
    }
  });

  it("端ケース: 全項目合格なら褒める文になり、TOP3 は空", () => {
    const s = buildPageSummary(
      mkPage([
        mkCheck("title", "meta", "pass", 3),
        mkCheck("jsonld-search-action", "structuredData", "info", 0),
      ]),
    );
    expect(s.overall).toBe(100);
    expect(s.grade.grade).toBe("A");
    expect(s.top3).toEqual([]);
    expect(s.projected).toBe(100);
    expect(s.failedLabels).toEqual([]);
    expect(s.commentary).toHaveLength(3);
    expect(lineText(s.commentary[1])).toContain("主要項目はすべて満たしています");
    expect(lineText(s.commentary[2])).toContain("参考項目（1 件）");
    expect(lineNums(s.commentary[2])).toEqual(["1"]);
  });

  it("端ケース: 参考項目も無い全項目合格", () => {
    const s = buildPageSummary(mkPage([mkCheck("title", "meta", "pass", 3)]));
    expect(lineText(s.commentary[2])).toContain("この水準を維持し");
  });

  it("端ケース: 未対応が多くても断定語を使わず、改善後の見込みを示す", () => {
    const s = buildPageSummary(
      mkPage([
        mkCheck("ai-crawlers-allowed", "crawlers", "fail", 3),
        mkCheck("noindex", "crawlers", "fail", 2),
        mkCheck("jsonld-exists", "structuredData", "fail", 3),
        mkCheck("jsonld-organization", "structuredData", "fail", 2),
        mkCheck("title", "meta", "fail", 3),
        mkCheck("description", "meta", "fail", 3),
        mkCheck("h1", "headings", "fail", 3),
        mkCheck("content-length", "content", "fail", 3),
      ]),
    );
    expect(s.overall).toBe(0);
    expect(s.grade.grade).toBe("E");
    expect(s.grade.label).toBe("要対策");
    expect(s.top3).toHaveLength(3);
    expect(s.projected).toBeGreaterThan(s.overall);
    expect(s.commentary).toHaveLength(3);
    for (const line of s.commentary) {
      expect(lineText(line)).not.toMatch(/危険|致命的|重大|最悪/);
    }
  });

  it("検索に載せないページを単体で診断したときは、その理由を返す", () => {
    const page = mkPage([mkCheck("title", "meta", "fail", 3)]);
    const s = buildPageSummary({
      ...page,
      page: { ...SNAPSHOT, url: "https://example.com/search?q=a", finalUrl: "https://example.com/search?q=a" },
      excluded: { label: "サイト内検索の結果ページ", noindex: true, robots: true },
    });
    expect(s.excluded).toEqual({
      url: "https://example.com/search?q=a",
      path: "/search?q=a",
      label: "サイト内検索の結果ページ",
      how: "noindex・robots.txt",
    });
    expect(buildPageSummary(page).excluded).toBeNull();
  });

  it("端ケース: カテゴリが空でも落ちない", () => {
    const s = buildPageSummary({ page: SNAPSHOT, overall: 0, categories: [], notes: [], excluded: null });
    expect(s.categories).toEqual([]);
    expect(s.best.id).toBe(CATEGORY_ORDER[0]);
    expect(s.worst.score).toBe(0);
    expect(s.improvements).toEqual([]);
    expect(s.commentary).toHaveLength(2);
    expect(lineText(s.commentary[1])).toContain("診断できた項目がありません");
  });

  it("端ケース: earned が欠けた項目でも配点から見込み加点を補う", () => {
    const broken: CheckResult = {
      id: "h1",
      category: "headings",
      status: "fail",
      label: "h1 がない",
      weight: 3,
      earned: Number.NaN,
    };
    const s = buildPageSummary(mkPage([broken, mkCheck("heading-structure", "headings", "pass", 2)]));
    // 3 / 5 × 15 = 9 点
    expect(s.top3[0].gain).toBeCloseTo(9, 6);
  });
});

// ---------------------------------------------------------------------------
// SITE モード
// ---------------------------------------------------------------------------

describe("buildSiteSummary", () => {
  const pages = [
    mkSitePage("https://example.com/", { crawlers: 100, structuredData: 80, meta: 90, headings: 100, content: 80 }),
    mkSitePage("https://example.com/a", { crawlers: 60, structuredData: 40, meta: 50, headings: 100, content: 60 }),
    mkSitePage("https://example.com/b", { crawlers: 60, structuredData: 60, meta: 70, headings: 100, content: 80 }),
    mkSitePage("https://example.com/c", { crawlers: 60, structuredData: 60, meta: 60, headings: 50, content: 60 }),
  ];
  const checks = [
    // 全 4 ページで未対応（テンプレート側の問題）
    mkSiteCheck("noindex", "crawlers", { fail: 4 }, {
      advice: "noindex を外す",
      affected: pages.map((p) => ({ url: p.url, status: "fail" as const })),
    }),
    // 2 ページだけ未対応
    mkSiteCheck("ai-crawlers-allowed", "crawlers", { fail: 2, pass: 2 }, {
      affected: [
        { url: "https://example.com/a", status: "fail" as const, evidence: "GPTBot が拒否されています" },
        { url: "https://example.com/b", status: "fail" as const },
      ],
    }),
    mkSiteCheck("llms-txt", "crawlers", { pass: 4 }),
    // 一部のページにしか現れない項目（全ページ共通とは呼べない）
    mkSiteCheck("jsonld-parse-error", "structuredData", { fail: 2 }),
    mkSiteCheck("jsonld-website", "structuredData", { warn: 1, pass: 3 }, {
      affected: [{ url: "https://example.com/c", status: "warn" as const }],
    }),
    mkSiteCheck("jsonld-search-action", "structuredData", { info: 4 }),
  ];
  const site = mkSite(pages, checks);

  it("判定の件数はページ × 項目で数える", () => {
    expect(buildSiteSummary(site).counts).toEqual({
      pass: 9,
      warn: 1,
      fail: 8,
      info: 4,
      scored: 18,
    });
  });

  it("カテゴリ行は最低・最高と最低点のページを持つ", () => {
    const s = buildSiteSummary(site);
    expect(s.categories.map((c) => c.id)).toEqual([...CATEGORY_ORDER]);
    const structured = s.categories.find((c) => c.id === "structuredData");
    expect(structured?.score).toBe(60);
    expect(structured?.min).toBe(40);
    expect(structured?.max).toBe(80);
    expect(structured?.worstUrl).toBe("https://example.com/a");
    expect(s.pageCount).toBe(4);
  });

  it("集計が欠けていてもページから作り直す", () => {
    const s = buildSiteSummary(mkSite(pages, checks, { categories: [] }));
    expect(s.categories).toHaveLength(5);
    expect(s.categories.find((c) => c.id === "headings")?.min).toBe(50);
    expect(s.categories.find((c) => c.id === "headings")?.worstUrl).toBe("https://example.com/c");
  });

  it("見込み加点は (配点 × 未対応 + 0.5 × 配点 × 改善余地) / N / Σ配点 × カテゴリ配点", () => {
    const s = buildSiteSummary(site);
    // structuredData の Σ配点 = 2(jsonld-parse-error) + 1(jsonld-website) + 0(jsonld-search-action) = 3
    //   jsonld-parse-error: 2 × 2 / 4 / 3 × 25 = 8.333…
    //   jsonld-website:     0.5 × 1 × 1 / 4 / 3 × 25 = 1.041…
    // crawlers の Σ配点 = 3(ai-crawlers-allowed) + 2(noindex) + 0(llms-txt) = 5
    //   noindex:             2 × 4 / 4 / 5 × 20 = 8
    //   ai-crawlers-allowed: 3 × 2 / 4 / 5 × 20 = 6（配点は大きいが該当が 2 ページなので下）
    expect(s.improvements.map((i) => i.id)).toEqual([
      "jsonld-parse-error",
      "noindex",
      "ai-crawlers-allowed",
      "jsonld-website",
    ]);
    expect(s.improvements.map((i) => i.gainLabel)).toEqual(["+8 点", "+8 点", "+6 点", "+1 点"]);
    expect(s.improvements[0].gain).toBeCloseTo(8.333, 3);
    expect(s.improvements[1].gain).toBeCloseTo(8, 3);
    expect(s.improvements[3].gain).toBeCloseTo(1.042, 3);
    // 配点 0 の項目（llms-txt など参考表示）は改善提案に出さない
    expect(s.improvements.map((i) => i.id)).not.toContain("llms-txt");
    const uniformItem = s.improvements[1];
    expect(uniformItem.spread).toBe("uniform");
    expect(uniformItem.status).toBe("fail");
    expect(uniformItem.affectedPages).toBe(4);
    expect(uniformItem.affectedCount).toBe(4);
    expect(uniformItem.totalPages).toBe(4);
    expect(uniformItem.advice).toBe("noindex を外す");
    const ai = s.improvements[2];
    expect(ai.spread).toBe("mixed");
    expect(ai.affectedPages).toBe(2);
    expect(ai.affectedUrls).toEqual(["https://example.com/a", "https://example.com/b"]);
    expect(ai.evidence).toBe("GPTBot が拒否されています");
    // 全ページ合格の項目は優先改善に出さない
    expect(s.improvements.some((i) => i.id === "llms-txt")).toBe(false);
    expect(s.top3).toHaveLength(3);
    // 総合 70 点 + TOP3 の 8.33 + 8 + 6 = 92 点
    expect(s.overall).toBe(70);
    expect(s.projected).toBe(92);
    expect(s.projectedGrade.grade).toBe("A");
  });

  it("優先改善リストは全ページ共通とページ差を 1 本にまとめる", () => {
    const s = buildSiteSummary(site);
    expect(s.priorities.map((p) => p.id)).toEqual([
      "noindex", // 未対応 4 × 配点 2 = 8
      "ai-crawlers-allowed", // 未対応 2 × 配点 3 = 6
      "jsonld-parse-error", // 未対応 2 × 配点 2 = 4
      "jsonld-website", // 改善余地 1 × 配点 1
      "jsonld-search-action", // 参考のみ
    ]);
    const uniform = s.priorities[0];
    expect(uniform.spread).toBe("uniform");
    expect(uniform.worst).toBe("fail");
    expect(uniform.affectedCount).toBe(4);
    expect(uniform.totalPages).toBe(4);
    expect(uniform.priority).toBe(8);
    expect(uniform.advice).toBe("noindex を外す");
    const mixed = s.priorities[1];
    expect(mixed.spread).toBe("mixed");
    expect(mixed.secondary).toBe(0);
    // 一部のページにしか出ない項目は「全ページ共通」にしない
    expect(s.priorities[2].spread).toBe("mixed");
    expect(s.priorities[3].worst).toBe("warn");
    expect(s.priorities[3].secondary).toBe(1);
    expect(s.priorities[4].worst).toBe("info");
    expect(s.priorities[4].affectedCount).toBe(4);
    // 全ページ合格の項目は出さない
    expect(s.priorities.some((p) => p.id === "llms-txt")).toBe(false);
    expect(s.uniformFailCount).toBe(1);
  });

  it("ページ一覧は入力 URL を先頭に固定し、残りは総合の低い順", () => {
    const s = buildSiteSummary(site);
    expect(s.rankedPages.map((p) => p.path)).toEqual(["/（トップ）", "/a", "/c", "/b"]);
    expect(s.rankedPages.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    expect(s.rankedPages[0].isEntry).toBe(true);
    expect(s.rankedPages.slice(1).every((p) => !p.isEntry)).toBe(true);
    expect(s.rankedPages[1].scores.structuredData).toBe(40);
    expect(s.worstPage.path).toBe("/a");
    expect(s.bestPage.path).toBe("/（トップ）");
    expect(s.bestPage.grade.grade).toBe("B");
  });

  it("入力 URL は www・スキーム・末尾スラッシュの違いを吸収して照合する", () => {
    const s = buildSiteSummary(mkSite(pages, [], { entryUrl: "http://www.example.com/b/" }));
    expect(s.rankedPages[0].path).toBe("/b");
    expect(s.rankedPages[0].isEntry).toBe(true);
  });

  it("スコア分布は 0-49 / 50-64 / 65-79 / 80-89 / 90-100 の 5 区分（境界値を含む）", () => {
    const boundary = [49, 50, 65, 70, 80, 90].map((v, i) =>
      mkSitePage(`https://example.com/p${i}`, { crawlers: v }, v),
    );
    const s = buildSiteSummary(mkSite(boundary, []));
    expect(s.bands.map((b) => b.grade)).toEqual(["E", "D", "C", "B", "A"]);
    expect(s.bands.map((b) => b.range)).toEqual([
      "0–49",
      "50–64",
      "65–79",
      "80–89",
      "90–100",
    ]);
    expect(s.bands.map((b) => b.count)).toEqual([1, 1, 2, 1, 1]);
    expect(s.bands[2].label).toBe("改善余地あり");
    // 平均 67 点 / 中央値 67.5 → 68
    expect(s.average).toBe(67);
    expect(s.median).toBe(68);
    expect(s.modeBand.grade).toBe("C");
    // 平均 67 点は C 区分（65〜79）の 2/15 の位置
    expect(s.averageFraction).toBeCloseTo((2 + 2 / 15) / 5, 6);
  });

  it("講評は 3 行。全ページ共通の未対応があれば 2 行目で伝える", () => {
    const s = buildSiteSummary(site);
    expect(s.commentary).toHaveLength(3);
    expect(lineText(s.commentary[0])).toContain("4 ページの平均で総合");
    expect(lineNums(s.commentary[0])).toContain(String(s.overall));
    expect(lineText(s.commentary[1])).toBe(
      "全 4 ページ共通の未対応が 1 項目あり、テンプレートの修正で全ページに効果があります。",
    );
    expect(lineText(s.commentary[2])).toContain("優先改善 TOP3 に対応すると");
    for (const line of s.commentary) {
      expect(lineText(line)).not.toMatch(/危険|致命的/);
    }
  });

  it("全ページ共通の未対応が無ければ、最も低いカテゴリと判定件数を伝える", () => {
    const s = buildSiteSummary(
      mkSite(pages, [
        mkSiteCheck("ai-crawlers-allowed", "crawlers", { fail: 2, pass: 2 }),
        mkSiteCheck("jsonld-website", "structuredData", { warn: 1, pass: 3 }),
      ]),
    );
    expect(s.uniformFailCount).toBe(0);
    expect(lineText(s.commentary[1])).toBe(
      `最も低いのは${CATEGORY_LABELS.structuredData}（60 点）で、未対応 2 件・改善余地 1 件の判定があります。`,
    );
  });

  it("端ケース: クロールを打ち切ったときは 1 行目で触れる", () => {
    const s = buildSiteSummary(
      mkSite(pages, checks, {
        crawl: { ...mkSite(pages, checks).crawl, truncated: { reason: "max-pages", limit: 300 } },
      }),
    );
    expect(lineText(s.commentary[0])).toContain("上限 300 ページで打ち切ったため、4 ページ分の集計です。");
    expect(lineNums(s.commentary[0])).toContain("300");
  });

  it("端ケース: 制限時間での打ち切り", () => {
    const s = buildSiteSummary(
      mkSite(pages, checks, {
        crawl: {
          ...mkSite(pages, checks).crawl,
          truncated: { reason: "time-budget", limit: 240_000 },
        },
      }),
    );
    expect(lineText(s.commentary[0])).toContain("制限時間で打ち切ったため");
  });

  it("採点対象外のページは一覧・件数に入れず、付録用の行にする", () => {
    const s = buildSiteSummary(
      mkSite(pages, checks, {
        excluded: [
          { url: "https://example.com/search?q=a", label: "サイト内検索の結果ページ", noindex: true, robots: false },
          { url: "https://example.com/cart", label: "買い物かご・購入手続きのページ", noindex: false, robots: true },
        ],
      }),
    );
    expect(s.pageCount).toBe(4);
    expect(s.rankedPages).toHaveLength(4);
    expect(s.excludedPages).toEqual([
      { url: "https://example.com/search?q=a", path: "/search?q=a", label: "サイト内検索の結果ページ", how: "noindex" },
      { url: "https://example.com/cart", path: "/cart", label: "買い物かご・購入手続きのページ", how: "robots.txt" },
    ]);
    // 入力 URL は今までどおり先頭
    expect(s.rankedPages[0].isEntry).toBe(true);
  });

  it("入力 URL が採点対象外のときは、どのページにも「入力 URL」の印を付けない", () => {
    const s = buildSiteSummary(
      mkSite(pages, checks, {
        entryUrl: "https://example.com/search?q=a",
        excluded: [{ url: "https://example.com/search?q=a", label: "サイト内検索の結果ページ", noindex: true, robots: false }],
      }),
    );
    expect(s.rankedPages.every((p) => !p.isEntry)).toBe(true);
    // 印が無いので、純粋に総合の低い順
    expect(s.rankedPages.map((p) => p.path)).toEqual(["/a", "/c", "/b", "/（トップ）"]);
  });

  it("端ケース: 1 ページだけのサイト", () => {
    const one = [mkSitePage("https://example.com/", { crawlers: 60, structuredData: 60, meta: 60, headings: 60, content: 60 })];
    const s = buildSiteSummary(
      mkSite(one, [mkSiteCheck("title", "meta", { fail: 1 }), mkSiteCheck("lang", "meta", { pass: 1 })]),
    );
    expect(s.pageCount).toBe(1);
    expect(s.rankedPages).toHaveLength(1);
    expect(s.bestPage.url).toBe(s.worstPage.url);
    expect(s.median).toBe(60);
    expect(lineText(s.commentary[0])).toContain("1 ページを診断し、総合");
    // 1 ページでは「全ページ共通」と言わない
    expect(lineText(s.commentary[1])).toContain("最も低いのは");
    expect(s.priorities[0].spread).toBe("uniform");
  });

  it("端ケース: 診断できたページが 0 でも落ちない", () => {
    const s = buildSiteSummary(mkSite([], []));
    expect(s.pageCount).toBe(0);
    expect(s.overall).toBe(0);
    expect(s.rankedPages).toEqual([]);
    expect(s.categories).toEqual([]);
    expect(s.priorities).toEqual([]);
    expect(s.improvements).toEqual([]);
    expect(s.median).toBe(0);
    expect(s.averageFraction).toBe(0);
    expect(s.bands.every((b) => b.count === 0)).toBe(true);
    expect(s.worstPage.overall).toBe(0);
    expect(s.bestPage.url).toBe("https://example.com/");
    expect(s.commentary).toHaveLength(1);
    expect(lineText(s.commentary[0])).toContain("診断できたページがありません");
  });

  it("端ケース: 全ページ全項目合格", () => {
    const clean = [
      mkSitePage("https://example.com/", { crawlers: 100, structuredData: 100, meta: 100, headings: 100, content: 100 }),
      mkSitePage("https://example.com/a", { crawlers: 100, structuredData: 100, meta: 100, headings: 100, content: 100 }),
    ];
    const s = buildSiteSummary(
      mkSite(clean, [
        mkSiteCheck("title", "meta", { pass: 2 }),
        mkSiteCheck("jsonld-search-action", "structuredData", { info: 2 }),
      ]),
    );
    expect(s.overall).toBe(100);
    expect(s.top3).toEqual([]);
    expect(s.priorities.map((p) => p.id)).toEqual(["jsonld-search-action"]);
    expect(s.commentary).toHaveLength(3);
    expect(lineText(s.commentary[1])).toContain("2 ページのすべてで主要項目を満たしています");
    expect(lineText(s.commentary[2])).toContain("参考項目（2 件）");
  });
});
