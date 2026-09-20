import { describe, expect, it } from "vitest";
import { checkOwnSite, type FetchedPage } from "../site";
import type { NapInput } from "../types";

const input: NapInput = { name: "株式会社ウルフ情報", address: "東京都渋谷区神南1-2-3 ウルフビル4F", phone: "03-1234-5678", website: "example.co.jp" };

const TOP = `<html><head><title>ウルフ情報</title></head><body>
<a href="/company/">会社概要</a><a href="/contact/">お問い合わせ</a><a href="/access/">アクセス</a>
<footer>株式会社ウルフ情報 東京都渋谷区神南1-2-3 ウルフビル4F TEL 03-1234-5678</footer></body></html>`;
const COMPANY = `<html><head><script type="application/ld+json">{"@type":"Organization","name":"株式会社ウルフ情報","telephone":"03-9999-0000","address":"東京都渋谷区神南1-2-3 ウルフビル4F","url":"https://example.co.jp/"}</script></head>
<body><h1>会社概要</h1><p>社名 株式会社ウルフ情報</p><p>所在地 東京都渋谷区神南1-2-3 ウルフビル4F</p><p>電話 03-9999-0000</p></body></html>`;
const CONTACT = `<html><body><h1>お問い合わせ</h1><p>ウルフ情報 渋谷店 TEL 03-1234-5678</p></body></html>`;

function fetcher(pages: Record<string, { status?: number; html: string }>) {
  const calls: string[] = [];
  const fetchPage = async (url: string): Promise<FetchedPage> => {
    calls.push(url);
    const p = pages[url];
    if (!p) throw new Error("network down");
    return { url, finalUrl: url, status: p.status ?? 200, html: p.html };
  };
  return { fetchPage, calls };
}

describe("自社サイトの確認", () => {
  it("トップ → 会社概要・お問い合わせ・アクセスを辿り、ページごとと構造化データを分けて返す", async () => {
    const { fetchPage, calls } = fetcher({
      "https://example.co.jp/": { html: TOP },
      "https://example.co.jp/company/": { html: COMPANY },
      "https://example.co.jp/contact/": { html: CONTACT },
      "https://example.co.jp/access/": { status: 404, html: "<html>not found</html>" },
    });
    const r = await checkOwnSite(input, fetchPage);
    expect(calls).toEqual(["https://example.co.jp/", "https://example.co.jp/company/", "https://example.co.jp/contact/", "https://example.co.jp/access/"]);
    expect(r.hasJsonLd).toBe(false);
    expect(r.pagesChecked).toBe(3);
    expect(r.sources.map((s) => [s.kind, s.label, s.error])).toEqual([
      ["site_page", "トップページ", null],
      ["site_jsonld", "構造化データ（Organization）", null],
      ["site_page", "会社概要", null],
      ["site_page", "お問い合わせ", null],
      ["site_page", "アクセス", "ページを取得できませんでした（HTTP 404）"],
    ]);
    const top = r.sources[0];
    expect(top.fields.map((f) => [f.field, f.status])).toEqual([
      ["name", "match"],
      ["address", "match"],
      ["phone", "match"],
      ["website", "skipped"],
    ]);
    const jsonLd = r.sources[1];
    expect(jsonLd.fields.find((f) => f.field === "phone")).toMatchObject({ status: "mismatch", found: "03-9999-0000" });
    expect(jsonLd.fields.find((f) => f.field === "website")?.status).toBe("match");
    const company = r.sources[2];
    expect(company.fields.find((f) => f.field === "phone")).toMatchObject({ status: "mismatch" });
    const contact = r.sources[3];
    expect(contact.fields.find((f) => f.field === "name")).toMatchObject({ status: "mismatch" });
    expect(contact.fields.find((f) => f.field === "address")?.status).toBe("missing");
  });

  it("トップが取れなければ 1 件のエラーだけ返す。URL が不正でも例外にしない", async () => {
    const { fetchPage } = fetcher({});
    const r = await checkOwnSite(input, fetchPage);
    expect(r.sources).toEqual([{ kind: "site_page", label: "トップページ", url: "https://example.co.jp/", fields: [], error: "ページを取得できませんでした" }]);
    const bad = await checkOwnSite({ ...input, website: "ftp://x" }, fetchPage);
    expect(bad.sources[0].error).toBeTruthy();
  });

  it("締め切りを過ぎたら下層ページは辿らない", async () => {
    const { fetchPage, calls } = fetcher({ "https://example.co.jp/": { html: TOP } });
    const r = await checkOwnSite(input, fetchPage, Date.now() - 1);
    expect(calls).toEqual(["https://example.co.jp/"]);
    expect(r.sources).toHaveLength(1);
  });
});
