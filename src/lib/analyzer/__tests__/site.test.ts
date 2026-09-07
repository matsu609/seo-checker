import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SiteProgress } from "../types";
import { analyze } from "../index";
import { analyzeSite } from "../site";

/**
 * ローカルに立てたダミーサイトに対して、実際に fetch させて診断する。
 *
 * 再現したい状況: トップと /company は同じサイトだが、
 *  - トップだけ WebSite の JSON-LD があり、パンくずが無い
 *  - /company だけパンくずがあり、WebSite が無い
 *  - /company は表組み中心で、本文の書き方もトップとは違う
 * この状態でページ単位のスコアが何によって変わるのかと、サイト診断がその差を
 * 「ページによって差がある項目」として拾えることを確かめる。
 */

const HEAD = (title: string, jsonLd: string) => `
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="description" content="${"あ".repeat(70)}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="説明">
    <link rel="canonical" href="/">
    <script type="application/ld+json">${jsonLd}</script>
  </head>`;

const TOP_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "ダミー社", sameAs: ["https://example.com/x"] },
    { "@type": "WebSite", name: "ダミー社", url: "/" },
  ],
});

const COMPANY_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "ダミー社", sameAs: ["https://example.com/x"] },
    { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1 }] },
  ],
});

const PARAGRAPH = "当社はダミーの会社です。事業内容や実績についてご紹介します。".repeat(40);

const TOP_HTML = `<!doctype html><html lang="ja">${HEAD("ダミー社", TOP_JSONLD)}
  <body>
    <nav><a href="/">ホーム</a><a href="/company">会社概要</a><a href="/service">サービス</a></nav>
    <main>
      <h1>ダミー社</h1>
      <h2>事業内容</h2><p>${PARAGRAPH}</p>
      <h2>実績</h2><p>${PARAGRAPH}</p>
      <img src="/a.png" alt="オフィスの外観">
    </main>
  </body></html>`;

/** 会社概要ページ: 説明文は短く、情報の大半が table にある */
const COMPANY_HTML = `<!doctype html><html lang="ja">${HEAD("会社概要 | ダミー社", COMPANY_JSONLD)}
  <body>
    <nav><a href="/">ホーム</a><a href="/company">会社概要</a></nav>
    <main>
      <h1>会社概要</h1>
      <p>当社の会社概要です。</p>
      <h2>基本情報</h2>
      <table>
        ${Array.from(
          { length: 30 },
          (_, i) =>
            `<tr><th>項目${i}</th><td>${"会社概要の詳細な情報をここに記載します。".repeat(3)}</td></tr>`,
        ).join("")}
      </table>
    </main>
  </body></html>`;

const SERVICE_HTML = `<!doctype html><html lang="ja">${HEAD("サービス | ダミー社", COMPANY_JSONLD)}
  <body>
    <nav><a href="/">ホーム</a></nav>
    <main><h1>サービス</h1><h2>詳細</h2><p>${PARAGRAPH}</p></main>
  </body></html>`;

/** サイトマップには無く、/service からだけリンクされている記事 */
const ARTICLE_HTML = `<!doctype html><html lang="ja">${HEAD("記事 | ダミー社", COMPANY_JSONLD)}
  <body>
    <nav><a href="/">ホーム</a></nav>
    <main><h1>記事</h1><h2>本文</h2><p>${PARAGRAPH}</p></main>
  </body></html>`;

let server: Server;
let origin: string;
/** "/" から別オリジン（server）へ転送するだけのサイト */
let redirector: Server;
let redirectorOrigin: string;

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_HOSTS = "1";
  server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const send = (body: string, type = "text/html; charset=utf-8") => {
      res.writeHead(200, { "content-type": type });
      res.end(body);
    };
    switch (path) {
      case "/":
        return send(TOP_HTML);
      case "/company":
        return send(COMPANY_HTML);
      case "/service":
        return send(SERVICE_HTML.replace("</main>", `<a href="/blog/article">記事</a></main>`));
      case "/blog/article":
        return send(ARTICLE_HTML);
      case "/robots.txt":
        return send(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml`, "text/plain");
      case "/sitemap.xml":
        return send(
          `<?xml version="1.0"?><urlset>${["/", "/company", "/service"]
            .map((p) => `<url><loc>${origin}${p}</loc></url>`)
            .join("")}</urlset>`,
          "application/xml",
        );
      default:
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  redirector = createServer((req, res) => {
    res.writeHead(302, { location: `${origin}${req.url ?? "/"}` });
    res.end();
  });
  await new Promise<void>((resolve) => redirector.listen(0, "127.0.0.1", resolve));
  redirectorOrigin = `http://127.0.0.1:${(redirector.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env.ALLOW_PRIVATE_HOSTS;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await new Promise<void>((resolve) => redirector.close(() => resolve()));
});

describe("ページ単位の診断", () => {
  it("同じサイトでもページごとに構造化データの点が変わる", async () => {
    const top = await analyze(`${origin}/`);
    const company = await analyze(`${origin}/company`);

    const types = (r: Awaited<ReturnType<typeof analyze>>) => r.page.jsonLdTypes;
    expect(types(top)).toContain("WebSite");
    expect(types(top)).not.toContain("BreadcrumbList");
    expect(types(company)).toContain("BreadcrumbList");
    expect(types(company)).not.toContain("WebSite");

    const sd = (r: Awaited<ReturnType<typeof analyze>>) =>
      r.categories.find((c) => c.id === "structuredData")!.score;
    // 配点は WebSite 1 点・パンくず 1 点で同じなので、この 2 ページは同点になる。
    // 差が出るのは「どの項目で失点しているか」であって、採点の分母ではない
    expect(sd(top)).toBe(sd(company));
  });

  // 会社概要ページのスコアが低いのは本文抽出の取りこぼしではないことの確認。
  // Readability は table 中心のページでも中身をきちんと拾う
  it("表組み中心のページでも table の中身を本文として数える", async () => {
    const company = await analyze(`${origin}/company`);
    expect(company.page.mainTextLength).toBeGreaterThan(1000);
  });

  it("画像の無いページでも image-alt が採点対象に入る", async () => {
    const company = await analyze(`${origin}/company`);
    const content = company.categories.find((c) => c.id === "content")!;
    const alt = content.checks.find((c) => c.id === "image-alt");
    expect(alt?.status).toBe("pass");
    // 画像のあるトップと配点合計（分母）が一致する
    const top = await analyze(`${origin}/`);
    const total = (r: Awaited<ReturnType<typeof analyze>>) =>
      r.categories.find((c) => c.id === "content")!.checks.reduce((s, c) => s + c.weight, 0);
    expect(total(company)).toBe(total(top));
  });

  it("入力 URL は page.url に、転送先は finalUrl に残る", async () => {
    const r = await analyze(`${redirectorOrigin}/company`);
    expect(r.page.url).toBe(`${redirectorOrigin}/company`);
    expect(r.page.finalUrl).toBe(`${origin}/company`);
    expect(r.notes.some((n) => n.includes("リダイレクト先"))).toBe(true);
  });
});

describe("analyzeSite", () => {
  it("sitemap のページに加えて、内部リンクだけのページも全部集めて集計する", async () => {
    const site = await analyzeSite(`${origin}/`);

    expect(site.discovery).toBe("sitemap+links");
    expect(site.pages.map((p) => new URL(p.url).pathname).sort()).toEqual([
      "/",
      "/blog/article",
      "/company",
      "/service",
    ]);
    // 入力 URL が先頭
    expect(new URL(site.pages[0].url).pathname).toBe("/");
    expect(site.failures).toEqual([]);
    expect(site.overall).toBeGreaterThan(0);
    expect(site.crawl).toMatchObject({
      discovered: 4,
      fetched: 4,
      analyzed: 4,
      failed: 0,
      skipped: 0,
      sitemapCount: 2, // 入力 URL "/" 以外の sitemap 掲載ページ
      linkCount: 1,
      truncated: null,
    });
    expect(site.crawl.durationMs).toBeGreaterThanOrEqual(0);
    // 全ページ分の本文そのものは返さない（長さの数字だけ残す）
    for (const p of site.pages) {
      expect(p.page).not.toHaveProperty("mainText");
    }
    expect(site.pages[0].page.mainTextLength).toBeGreaterThan(2000);
  });

  it("ページ間で差がある項目を mixed として拾う", async () => {
    const site = await analyzeSite(`${origin}/`);
    const byId = Object.fromEntries(site.checks.map((c) => [c.id, c]));

    // トップだけパンくずが無い / トップだけ WebSite がある
    expect(byId["jsonld-breadcrumb"].spread).toBe("mixed");
    expect(byId["jsonld-breadcrumb"].affected.map((a) => new URL(a.url).pathname)).toEqual(["/"]);
    expect(byId["jsonld-website"].spread).toBe("mixed");

    // robots.txt はサイト共通なので全ページ同じ
    expect(byId["ai-crawlers-allowed"].spread).toBe("uniform");
    expect(byId["ai-crawlers-allowed"].counts.pass).toBe(4);
    // llms.txt はどのページでも無い = テンプレートではなくサイト側の問題
    expect(byId["llms-txt"].spread).toBe("uniform");
    expect(byId["llms-txt"].counts.warn).toBe(4);

    // ばらついた項目が先頭に並ぶ
    expect(site.checks[0].spread).toBe("mixed");
  });

  it("maxPages で打ち切ると truncated と注記が付く", async () => {
    const site = await analyzeSite(`${origin}/company`, { maxPages: 2 });
    expect(site.pages).toHaveLength(2);
    // 入力した URL が必ず先頭に含まれる
    expect(new URL(site.pages[0].url).pathname).toBe("/company");
    expect(site.crawl.truncated).toEqual({ reason: "max-pages", limit: 2 });
    expect(site.crawl.maxPages).toBe(2);
    expect(site.notes.some((n) => n.includes("上限 2 ページ") && n.includes("SITE_MAX_PAGES"))).toBe(
      true,
    );
  });

  it("進捗を 1 ページごとに通知する", async () => {
    const progress: SiteProgress[] = [];
    const site = await analyzeSite(`${origin}/`, { onProgress: (p) => progress.push(p) });
    expect(progress[0].phase).toBe("discover");
    const crawl = progress.filter((p) => p.phase === "crawl");
    expect(crawl).toHaveLength(site.crawl.fetched);
    const last = crawl[crawl.length - 1];
    expect(last.fetched).toBe(4);
    expect(last.analyzed).toBe(4);
    expect(last.queued).toBe(0);
    expect(last.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("別オリジンへ転送される入力は、転送先のサイトとして診断する", async () => {
    const site = await analyzeSite(`${redirectorOrigin}/`);
    expect(site.entryUrl).toBe(`${redirectorOrigin}/`);
    expect(site.origin).toBe(origin);
    expect(site.pages.map((p) => new URL(p.url).pathname).sort()).toEqual([
      "/",
      "/blog/article",
      "/company",
      "/service",
    ]);
    expect(site.notes.some((n) => n.includes("リダイレクト先"))).toBe(true);
  });

  it("入力ページが取得できなければ、クロールせずにエラーにする", async () => {
    await expect(analyzeSite(`${origin}/missing`)).rejects.toThrow("HTTP 404");
  });
});
