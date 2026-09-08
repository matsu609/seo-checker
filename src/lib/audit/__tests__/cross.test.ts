import { describe, expect, it } from "vitest";
import { applyDepths, buildResult, collectProbeTargets, countInlinks } from "../run";
import {
  ruleCanonicalLoop,
  ruleDuplicateContent,
  ruleDuplicateDescription,
  ruleDuplicateTitle,
  ruleOrphanPage,
  ruleProbedStatuses,
  ruleSiteFiles,
  ruleSitemapDiff,
  runCrossRules,
} from "../rules";
import { minHashSignature } from "../similarity";
import type { AuditPage } from "../types";
import { ORIGIN, html, japaneseText, makeContext, pageFrom, probe, ruleIds } from "./fixtures";

/** リンクだけを差し替えた最小のページ */
function page(path: string, options: { title?: string; description?: string; canonical?: string; links?: string[]; body?: string } = {}): AuditPage {
  const head = [
    options.title ? `<title>${options.title}</title>` : "",
    options.description ? `<meta name="description" content="${options.description}">` : "",
    options.canonical ? `<link rel="canonical" href="${options.canonical}">` : "",
  ].join("");
  const links = (options.links ?? []).map((href) => `<a href="${href}">link</a>`).join("");
  const body = `<main><h1>${path}</h1>${options.body ?? ""}${links}</main>`;
  return pageFrom(html({ head, body }), { url: `${ORIGIN}${path}`, finalUrl: `${ORIGIN}${path}` });
}

describe("重複の検出", () => {
  it("同じ title を持つページを全件報告する", () => {
    const pages = [page("/a", { title: "会社概要" }), page("/b", { title: "会社概要" }), page("/c", { title: "採用" })];
    const issues = ruleDuplicateTitle(pages, makeContext());
    expect(ruleIds(issues)).toEqual(["TITLE_DUPLICATE", "TITLE_DUPLICATE"]);
    expect(issues.map((i) => i.url)).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`]);
    expect(issues[0].detail).toContain(`${ORIGIN}/b`);
  });

  it("title が 1 件ずつなら何も出さない", () => {
    const pages = [page("/a", { title: "会社概要" }), page("/b", { title: "採用" })];
    expect(ruleDuplicateTitle(pages, makeContext())).toEqual([]);
  });

  it("同じ description を持つページを報告する", () => {
    const desc = "あ".repeat(80);
    const pages = [page("/a", { description: desc }), page("/b", { description: desc })];
    expect(ruleIds(ruleDuplicateDescription(pages, makeContext()))).toEqual([
      "META_DESC_DUPLICATE",
      "META_DESC_DUPLICATE",
    ]);
  });

  it("本文が完全一致するページを CONTENT_DUPLICATE にする", () => {
    const text = `<p>${japaneseText(600)}</p>`;
    const pages = [page("/a", { body: text }), page("/b", { body: text })];
    // /a と /b は h1 が違うだけなので指紋は一致しない。署名で拾えることを確かめる
    const context = makeContext({
      signatures: Object.fromEntries(pages.map((p) => [p.url, minHashSignature(japaneseText(600))])),
    });
    const issues = ruleDuplicateContent(pages, context);
    expect(ruleIds(issues)).toEqual(["CONTENT_DUPLICATE", "CONTENT_DUPLICATE"]);
  });

  it("本文が薄いページは重複判定の対象にしない", () => {
    const pages = [page("/a", { body: "<p>短い</p>" }), page("/b", { body: "<p>短い</p>" })];
    expect(ruleDuplicateContent(pages, makeContext())).toEqual([]);
  });

  it("内容の違うページは重複にしない", () => {
    const a = page("/a", { body: `<p>${japaneseText(800)}</p>` });
    const b = page("/b", { body: `<p>${"採用情報を掲載しています全国から応募を受け付けています".repeat(30)}</p>` });
    const context = makeContext({
      signatures: {
        [a.url]: minHashSignature(japaneseText(800)),
        [b.url]: minHashSignature("採用情報を掲載しています全国から応募を受け付けています".repeat(30)),
      },
    });
    expect(ruleDuplicateContent([a, b], context)).toEqual([]);
  });
});

describe("canonical の循環", () => {
  it("A → B → A の閉路を検出する", () => {
    const pages = [
      page("/a", { canonical: `${ORIGIN}/b` }),
      page("/b", { canonical: `${ORIGIN}/a` }),
      page("/c", { canonical: `${ORIGIN}/c` }),
    ];
    const issues = ruleCanonicalLoop(pages, makeContext());
    expect(ruleIds(issues)).toEqual(["CANONICAL_LOOP", "CANONICAL_LOOP"]);
    expect(issues.map((i) => i.url).sort()).toEqual([`${ORIGIN}/a`, `${ORIGIN}/b`]);
  });

  it("3 つ以上の閉路も検出する", () => {
    const pages = [
      page("/a", { canonical: `${ORIGIN}/b` }),
      page("/b", { canonical: `${ORIGIN}/c` }),
      page("/c", { canonical: `${ORIGIN}/a` }),
    ];
    expect(ruleCanonicalLoop(pages, makeContext())).toHaveLength(3);
  });

  it("自分自身を指す canonical は循環にしない", () => {
    const pages = [page("/a", { canonical: `${ORIGIN}/a` }), page("/b", { canonical: `${ORIGIN}/a` })];
    expect(ruleCanonicalLoop(pages, makeContext())).toEqual([]);
  });
});

describe("孤立ページ", () => {
  it("内部リンクの入次数が 0 のページを ORPHAN_PAGE にする", () => {
    const pages = [
      page("/", { links: [`${ORIGIN}/a`] }),
      page("/a", { links: [`${ORIGIN}/`] }),
      page("/orphan"),
    ];
    const issues = ruleOrphanPage(pages, makeContext({ entryUrl: `${ORIGIN}/` }));
    expect(issues.map((i) => i.url)).toEqual([`${ORIGIN}/orphan`]);
  });

  it("入力 URL は入次数 0 でも孤立扱いにしない", () => {
    const pages = [page("/", { links: [`${ORIGIN}/a`] }), page("/a")];
    const issues = ruleOrphanPage(pages, makeContext({ entryUrl: `${ORIGIN}/` }));
    expect(issues).toEqual([]);
  });

  it("自己リンクは入次数に数えない", () => {
    const pages = [page("/", { links: [`${ORIGIN}/a`] }), page("/a", { links: [`${ORIGIN}/a`] })];
    expect(ruleOrphanPage(pages, makeContext({ entryUrl: `${ORIGIN}/` }))).toEqual([]);
  });
});

describe("サイト共通ファイル", () => {
  it("robots.txt / sitemap.xml が無ければそれぞれ課題にする", () => {
    const context = makeContext({ robotsExists: false, sitemapFound: false });
    expect(ruleIds(ruleSiteFiles([], context)).sort()).toEqual([
      "LLMS_TXT_MISSING",
      "ROBOTS_MISSING",
      "SITEMAP_MISSING",
    ]);
    // 既定のフィクスチャは llms.txt が無いので、それだけが残る
    expect(ruleIds(ruleSiteFiles([], makeContext()))).toEqual(["LLMS_TXT_MISSING"]);
  });

  // llms.txt は提案段階の仕様で、読み取りを表明した主要な AI クローラが無い。
  // 無いことを警告にする根拠が無いので info（任意）に留める
  it("llms.txt の不在は任意項目、あれば llms-full.txt を任意項目として案内する", () => {
    const withLlms = makeContext({
      siteFiles: {
        ...makeContext().siteFiles,
        llmsTxt: { present: true, length: 420, status: 200 },
      },
    });
    const issues = ruleSiteFiles([], withLlms);
    expect(ruleIds(issues)).toEqual(["LLMS_FULL_TXT_MISSING"]);
    expect(issues[0].severity).toBe("info");

    const both = makeContext({
      siteFiles: {
        ...makeContext().siteFiles,
        llmsTxt: { present: true, length: 420, status: 200 },
        llmsFullTxt: { present: true, length: 9000 },
      },
    });
    expect(ruleSiteFiles([], both)).toEqual([]);

    const missing = ruleSiteFiles([], makeContext());
    expect(missing[0].severity).toBe("info");
    expect(missing[0].url).toBe(ORIGIN);
  });

  it("課題の URL はオリジンになる", () => {
    const issues = ruleSiteFiles([], makeContext({ sitemapFound: false }));
    expect(issues[0].url).toBe(ORIGIN);
  });
});

describe("検証した URL", () => {
  it("クロールされなかった 4XX / 5XX を報告する", () => {
    const pages = [page("/")];
    const context = makeContext({
      probes: {
        [`${ORIGIN}/gone`]: probe(404, `${ORIGIN}/gone`),
        [`${ORIGIN}/broken`]: probe(500, `${ORIGIN}/broken`),
        [`${ORIGIN}/`]: probe(200, `${ORIGIN}/`),
      },
    });
    expect(ruleIds(ruleProbedStatuses(pages, context)).sort()).toEqual(["STATUS_4XX", "STATUS_5XX"]);
  });

  it("クロール済みの URL は二重に報告しない", () => {
    const pages = [page("/")];
    const context = makeContext({ probes: { [`${ORIGIN}/`]: probe(404, `${ORIGIN}/`) } });
    expect(ruleProbedStatuses(pages, context)).toEqual([]);
  });
});

describe("サイトマップとの差分", () => {
  it("サイトマップにあるのに 404 の URL を報告する", () => {
    const pages = [page("/")];
    const context = makeContext({
      sitemapUrls: [`${ORIGIN}/`, `${ORIGIN}/gone`],
      probes: { [`${ORIGIN}/gone`]: probe(404, `${ORIGIN}/gone`) },
    });
    const issues = ruleSitemapDiff(pages, context);
    expect(issues[0].detail).toContain("取得できない URL が 1 件");
  });

  it("サイトマップに無いページを情報として出す", () => {
    const pages = [page("/"), page("/deep")];
    const context = makeContext({ sitemapUrls: [`${ORIGIN}/`] });
    const info = ruleSitemapDiff(pages, context).find((i) => i.severity === "info");
    expect(info?.detail).toContain("載っていないページが 1 件");
  });

  it("サイトマップが見つからないときは差分を出さない", () => {
    const context = makeContext({ sitemapFound: false, sitemapUrls: [] });
    expect(ruleSitemapDiff([page("/")], context)).toEqual([]);
  });
});

describe("リンクグラフ", () => {
  it("入力 URL からの最短ホップ数を入れる", () => {
    const pages = [
      page("/", { links: [`${ORIGIN}/a`] }),
      page("/a", { links: [`${ORIGIN}/b`] }),
      page("/b"),
      page("/island"),
    ];
    applyDepths(pages, `${ORIGIN}/`);
    expect(pages.map((p) => p.depth)).toEqual([0, 1, 2, null]);
  });

  it("入次数を数える", () => {
    const pages = [page("/", { links: [`${ORIGIN}/a`, `${ORIGIN}/b`] }), page("/a", { links: [`${ORIGIN}/b`] }), page("/b")];
    const inlinks = countInlinks(pages);
    expect(inlinks.get(`${ORIGIN}/b`)).toBe(2);
    expect(inlinks.get(`${ORIGIN}/`)).toBe(0);
  });

  it("検証対象にはクロール済みの URL を含めない", () => {
    const pages = [page("/", { links: [`${ORIGIN}/a`, `${ORIGIN}/gone`] }), page("/a")];
    const targets = collectProbeTargets(pages, [], [`${ORIGIN}/sitemap-only`], ORIGIN);
    expect(targets).toContain(`${ORIGIN}/gone`);
    expect(targets).toContain(`${ORIGIN}/sitemap-only`);
    expect(targets).not.toContain(`${ORIGIN}/a`);
  });

  it("別オリジンの canonical 先は取得しない（内部アドレスへの踏み台にしない）", () => {
    const pages = [page("/", { canonical: "http://169.254.169.254/latest/meta-data/" })];
    const targets = collectProbeTargets(pages, ["http://10.0.0.5:8080/"], [], ORIGIN);
    expect(targets).toEqual([]);
  });
});

describe("集計", () => {
  it("カテゴリ・重要度・ルール別の件数をまとめる", () => {
    const pages = [page("/a", { title: "同じ" }), page("/b", { title: "同じ" })];
    const issues = runCrossRules(pages, makeContext({ sitemapFound: false }));
    const result = buildResult({
      startUrl: `${ORIGIN}/`,
      origin: ORIGIN,
      crawledAt: "2026-09-07T00:00:00.000Z",
      pages,
      issues,
      crawlStats: {
        discovered: 2,
        fetched: 2,
        analyzed: 2,
        failed: 0,
        skipped: 0,
        durationMs: 100,
        maxPages: 100,
        truncated: null,
        sitemapCount: 0,
        linkCount: 2,
        probed: 0,
        timed: 0,
      },
      failures: [],
      notes: [],
    });
    expect(result.byCategory).toHaveLength(10);
    expect(result.byCategory.find((c) => c.category === "タイトルタグ")?.count).toBe(2);
    expect(result.byRule[0].count).toBeGreaterThan(0);
    expect(result.bySeverity.error).toBeGreaterThan(0);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].issues).toBeGreaterThan(0);
    // サマリーは AI が無くても必ず入る
    expect(result.summary?.source).toBe("rule");
    expect(result.summary?.overall).toContain("2 ページを診断");
  });
});
