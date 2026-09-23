/**
 * 入力 URL が別オリジンへ転送されるサイト（裸のドメイン → www、http → https）。
 *
 * 2026-09-23 まで、サイト診断（runAudit）と llms.txt の候補集め（scanSite）は
 * オリジンを転送後の URL から、入力ページの URL を転送前の URL から取っていたため、
 * crawlSite が入力ページを「別オリジン」として捨て、サイトマップの無いサイトでは
 * 0 ページになっていた。ここでは 127.0.0.1 のサーバーを 2 つ立て、片方（裸のドメイン役）が
 * すべてをもう片方（www 役）へ 301 する形で確かめる。サイトマップは置かない。
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let bare: Server;
let www: Server;
let bareOrigin: string;
let wwwOrigin: string;

const page = (title: string, body: string) =>
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${title}</title>` +
  `<meta name="description" content="${title}のページです。転送のテスト用に用意した説明文を少し長めに書いています。"></head>` +
  `<body><h1>${title}</h1>${body}<p>${"本文です。".repeat(80)}</p></body></html>`;

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_HOSTS = "1";
  www = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    const html: Record<string, string> = {
      "/": page("転送先サイト｜トップ", '<a href="/about">会社概要</a><a href="/contact">お問い合わせ</a>'),
      "/about": page("会社概要｜転送先サイト", '<a href="/">トップ</a>'),
      "/contact": page("お問い合わせ｜転送先サイト", '<a href="/">トップ</a>'),
    };
    if (html[path]) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html[path]);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((resolve) => www.listen(0, "127.0.0.1", resolve));
  wwwOrigin = `http://127.0.0.1:${(www.address() as AddressInfo).port}`;

  bare = createServer((req, res) => {
    res.writeHead(301, { location: `${wwwOrigin}${req.url ?? "/"}` });
    res.end();
  });
  await new Promise<void>((resolve) => bare.listen(0, "127.0.0.1", resolve));
  bareOrigin = `http://127.0.0.1:${(bare.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env.ALLOW_PRIVATE_HOSTS;
  await new Promise<void>((resolve) => bare.close(() => resolve()));
  await new Promise<void>((resolve) => www.close(() => resolve()));
});

describe("入力 URL が別オリジンへ転送されるとき", () => {
  it("サイト診断は転送先をトップページとしてクロールする", async () => {
    const { runAudit } = await import("../run");
    const result = await runAudit(bareOrigin, { maxPages: 10 });
    expect(result.origin).toBe(wwwOrigin);
    expect(result.startUrl).toBe(`${wwwOrigin}/`);
    expect(result.pages.map((p) => p.url).sort()).toEqual(
      [`${wwwOrigin}/`, `${wwwOrigin}/about`, `${wwwOrigin}/contact`].sort(),
    );
    const top = result.pages.find((p) => p.url === `${wwwOrigin}/`);
    expect(top?.depth).toBe(0);
    expect(result.notes).toContain(`リダイレクト先 ${wwwOrigin} を診断しました`);
  }, 60_000);

  it("llms.txt の候補集めも転送先のトップを先頭にしてページを集める", async () => {
    const { scanSite } = await import("@/lib/llms-txt/scan");
    const scan = await scanSite(bareOrigin, { limit: 10 });
    expect(scan.origin).toBe(wwwOrigin);
    expect(scan.candidates.map((c) => c.url)).toEqual([
      `${wwwOrigin}/`,
      `${wwwOrigin}/about`,
      `${wwwOrigin}/contact`,
    ]);
    expect(scan.siteName).toBe("転送先サイト");
  }, 60_000);
});
