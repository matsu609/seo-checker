import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

let server: Server;
let origin: string;

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
        return send(SERVICE_HTML);
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
});

afterAll(async () => {
  delete process.env.ALLOW_PRIVATE_HOSTS;
  await new Promise<void>((resolve) => server.close(() => resolve()));
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
});

describe("analyzeSite", () => {
  it("sitemap からページを集めて集計する", async () => {
    const site = await analyzeSite(`${origin}/`);

    expect(site.discovery).toBe("sitemap");
    expect(site.pages.map((p) => new URL(p.url).pathname).sort()).toEqual([
      "/",
      "/company",
      "/service",
    ]);
    expect(site.failures).toEqual([]);
    expect(site.overall).toBeGreaterThan(0);
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
    expect(byId["ai-crawlers-allowed"].counts.pass).toBe(3);
    // llms.txt はどのページでも無い = テンプレートではなくサイト側の問題
    expect(byId["llms-txt"].spread).toBe("uniform");
    expect(byId["llms-txt"].counts.warn).toBe(3);

    // ばらついた項目が先頭に並ぶ
    expect(site.checks[0].spread).toBe("mixed");
  });

  it("maxPages でページ数を絞れる", async () => {
    const site = await analyzeSite(`${origin}/company`, { maxPages: 2 });
    expect(site.pages).toHaveLength(2);
    // 入力した URL が必ず含まれる
    expect(site.pages.map((p) => new URL(p.url).pathname)).toContain("/company");
  });
});
