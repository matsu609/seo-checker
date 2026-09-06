import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { checkContent, extractContent } from "../content";
import { normalizeUrl } from "../fetch";
import { checkHeadings, findLevelSkips } from "../headings";
import { checkStructuredData, extractJsonLd } from "../jsonld";
import { checkMeta } from "../meta";
import { evaluateRobots } from "../robots";
import { buildCategories, overallScore, scoreCategory } from "../scoring";
import { check, optionalCheck } from "../check";

describe("normalizeUrl", () => {
  it("補完: スキーム無しは https を付ける", () => {
    expect(normalizeUrl("example.com/page").toString()).toBe("https://example.com/page");
  });
  it("拒否: http/https 以外", () => {
    expect(() => normalizeUrl("ftp://example.com")).toThrow();
  });
  it("フラグメントは落とす", () => {
    expect(normalizeUrl("https://example.com/a#top").toString()).toBe("https://example.com/a");
  });
});

describe("evaluateRobots", () => {
  const pageUrl = "https://example.com/company";
  const robotsUrl = "https://example.com/robots.txt";

  it("robots.txt が無ければ全許可", () => {
    const r = evaluateRobots(null, pageUrl, robotsUrl);
    expect(r.exists).toBe(false);
    expect(r.blocked).toEqual([]);
  });

  it("特定 UA の Disallow を検出する", () => {
    const txt = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /";
    const r = evaluateRobots(txt, pageUrl, robotsUrl);
    expect(r.blocked).toEqual(["GPTBot"]);
    expect(r.allowed).toContain("ClaudeBot");
  });

  it("ワイルドカードで全ブロック", () => {
    const r = evaluateRobots("User-agent: *\nDisallow: /", pageUrl, robotsUrl);
    expect(r.allowed).toEqual([]);
  });

  it("パス単位の Disallow は対象 URL にだけ効く", () => {
    const txt = "User-agent: *\nDisallow: /admin/";
    const r = evaluateRobots(txt, pageUrl, robotsUrl);
    expect(r.blocked).toEqual([]);
  });
});

describe("extractJsonLd", () => {
  it("@graph・入れ子・複数タグ・配列 @type を集める", () => {
    const html = `
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
        {"@type":"Organization","name":"X","sameAs":["https://x.com/x"]},
        {"@type":"WebSite","potentialAction":{"@type":"SearchAction","target":"https://e.com/?q={q}"}}
      ]}</script>
      <script type="application/ld+json">{"@type":["BreadcrumbList","Thing"],"itemListElement":[{"@type":"ListItem"}]}</script>
      <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","acceptedAnswer":{"@type":"Answer"}}]}</script>
    `;
    const info = extractJsonLd(cheerio.load(html));
    expect(info.blocks).toBe(3);
    expect(info.parseErrors).toBe(0);
    expect(info.types).toEqual(
      expect.arrayContaining(["Organization", "WebSite", "SearchAction", "BreadcrumbList", "FAQPage", "Question", "Answer"]),
    );
    expect(info.hasSameAs).toBe(true);
    expect(info.hasSearchAction).toBe(true);
  });

  it("壊れた JSON はパースエラーとして数える", () => {
    const html = `<script type="application/ld+json">{"@type":"Organization",}</script>`;
    const info = extractJsonLd(cheerio.load(html));
    expect(info.parseErrors).toBe(1);
    expect(info.types).toEqual([]);
  });

  it("schema:Organization のような接頭辞付きも扱う", () => {
    const html = `<script type="application/ld+json">{"@type":"schema:LocalBusiness"}</script>`;
    expect(extractJsonLd(cheerio.load(html)).types).toEqual(["LocalBusiness"]);
  });
});

describe("checkStructuredData", () => {
  it("JSON-LD が無いと必須項目が fail/warn になる", () => {
    const results = checkStructuredData(cheerio.load("<html><body></body></html>"));
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId["jsonld-exists"].status).toBe("fail");
    expect(byId["jsonld-faq"].status).toBe("warn");
    expect(byId["jsonld-article"].status).toBe("info");
    expect(byId["jsonld-article"].weight).toBe(0);
  });
});

describe("checkMeta", () => {
  it("すべて揃っていれば pass", () => {
    const html = `<html lang="ja"><head>
      <title>株式会社Wolf | 会社情報</title>
      <meta name="description" content="${"あ".repeat(60)}">
      <meta property="og:title" content="t"><meta property="og:description" content="d">
      <link rel="canonical" href="https://example.com/">
    </head></html>`;
    const results = checkMeta(cheerio.load(html));
    expect(results.every((r) => r.status === "pass")).toBe(true);
  });

  it("title 無し・description 無しは fail", () => {
    const results = checkMeta(cheerio.load("<html><head></head></html>"));
    const byId = Object.fromEntries(results.map((r) => [r.id, r.status]));
    expect(byId.title).toBe("fail");
    expect(byId.description).toBe("fail");
    expect(byId.ogp).toBe("fail");
  });
});

describe("headings", () => {
  it("階層飛びを数える", () => {
    expect(findLevelSkips([1, 2, 3, 2, 3])).toBe(0);
    expect(findLevelSkips([1, 3])).toBe(1);
    expect(findLevelSkips([2, 4, 2, 5])).toBe(2);
  });

  it("h1 が 1 つで h2 があれば pass", () => {
    const html = "<h1>Title</h1><h2>A</h2><h3>a1</h3><h2>B</h2>";
    const results = checkHeadings(cheerio.load(html));
    expect(results.map((r) => r.status)).toEqual(["pass", "pass"]);
  });

  it("h1 が複数なら warn、h1 無しなら fail", () => {
    expect(checkHeadings(cheerio.load("<h1>a</h1><h1>b</h1><h2>c</h2>"))[0].status).toBe("warn");
    expect(checkHeadings(cheerio.load("<h2>c</h2>"))[0].status).toBe("fail");
  });

  it("空の見出しは無視する", () => {
    expect(checkHeadings(cheerio.load("<h1></h1><h1>real</h1><h2>x</h2>"))[0].status).toBe("pass");
  });
});

describe("content", () => {
  function page(bodyText: string, scripts = 0) {
    const s = Array.from({ length: scripts }, (_, i) => `<script src="/app${i}.js"></script>`).join("");
    return `<html><head><title>t</title>${s}</head><body><nav>menu menu</nav><main><h1>見出し</h1><p>${bodyText}</p></main><footer>foot</footer></body></html>`;
  }

  it("本文が十分あれば pass", () => {
    const html = page("日本語の本文です。".repeat(250));
    const $ = cheerio.load(html);
    const info = extractContent(html, "https://example.com/", $);
    expect(info.mainTextLength).toBeGreaterThanOrEqual(1500);
    const byId = Object.fromEntries(checkContent(info).map((r) => [r.id, r.status]));
    expect(byId["content-length"]).toBe("pass");
    expect(byId["js-rendering"]).toBeUndefined();
  });

  it("テキストがほぼ無く script が多ければ JS 依存を疑う", () => {
    const html = page("", 4);
    const $ = cheerio.load(html);
    const info = extractContent(html, "https://example.com/", $);
    const byId = Object.fromEntries(checkContent(info).map((r) => [r.id, r.status]));
    expect(byId["js-rendering"]).toBe("fail");
    expect(byId["content-length"]).toBe("fail");
  });

  it("alt の無い画像を数える", () => {
    const html = `<body><img src="a.png" alt="A"><img src="b.png"><img src="c.png" alt=""></body>`;
    const info = extractContent(html, "https://example.com/", cheerio.load(html));
    expect(info.images).toBe(3);
    expect(info.imagesWithoutAlt).toBe(2);
  });
});

describe("scoring", () => {
  it("warn は半分、info は無視", () => {
    const checks = [
      check({ id: "a", category: "meta", status: "pass", weight: 2, label: "" }),
      check({ id: "b", category: "meta", status: "warn", weight: 2, label: "" }),
      check({ id: "c", category: "meta", status: "fail", weight: 1, label: "" }),
      optionalCheck({ id: "d", category: "meta", present: false, label: "" }),
    ];
    // (2 + 1 + 0) / 5 = 60
    expect(scoreCategory(checks)).toBe(60);
  });

  it("空カテゴリは 100", () => {
    expect(scoreCategory([])).toBe(100);
  });

  it("総合はカテゴリ重みの加重平均", () => {
    const categories = buildCategories([
      check({ id: "x", category: "crawlers", status: "fail", weight: 1, label: "" }),
    ]);
    // crawlers 0点 (重み20), 他 4 カテゴリは 100 点 (重み合計80) → 80
    expect(overallScore(categories)).toBe(80);
  });
});
