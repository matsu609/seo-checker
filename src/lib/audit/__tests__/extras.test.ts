import { describe, expect, it } from "vitest";
import { normalizePhone, toIsoDate } from "../extras";
import { ORIGIN, html, pageFrom } from "./fixtures";

describe("内部リンクの詳細（links）", () => {
  it("本文のリンクとナビ・フッターのリンクを区別する", () => {
    const body = `
      <header><nav><a href="/service">サービス</a><a href="/company">会社概要</a></nav></header>
      <main><p>詳しくは<a href="/service/web">ウェブ制作の料金</a>をご覧ください。<a href="/company">会社概要</a></p></main>
      <footer><a href="/privacy" rel="nofollow">プライバシー</a><a href="/contact"><img src="/c.png" alt="お問い合わせ"></a></footer>`;
    const page = pageFrom(html({ body }), { url: `${ORIGIN}/`, finalUrl: `${ORIGIN}/` });
    const byUrl = new Map(page.links.map((l) => [l.url, l]));

    expect(byUrl.get(`${ORIGIN}/service`)).toMatchObject({ inContent: false, nofollow: false, text: "サービス" });
    expect(byUrl.get(`${ORIGIN}/service/web`)).toMatchObject({ inContent: true, text: "ウェブ制作の料金" });
    // ナビと本文の両方にあるリンクは本文扱い
    expect(byUrl.get(`${ORIGIN}/company`)).toMatchObject({ inContent: true });
    expect(byUrl.get(`${ORIGIN}/privacy`)).toMatchObject({ inContent: false, nofollow: true });
    // 画像リンクは alt をアンカーテキストにする
    expect(byUrl.get(`${ORIGIN}/contact`)?.text).toBe("お問い合わせ");
    // internalLinks と同じ URL 集合
    expect([...byUrl.keys()].sort()).toEqual([...page.internalLinks].sort());
  });

  it("main が無いページでは、ナビ等の外はすべて本文とみなす", () => {
    const body = `<nav><a href="/a">a</a></nav><div><p><a href="/b">b の説明</a></p></div>`;
    const page = pageFrom(html({ body }));
    expect(page.links.find((l) => l.url.endsWith("/a"))?.inContent).toBe(false);
    expect(page.links.find((l) => l.url.endsWith("/b"))?.inContent).toBe(true);
  });

  it("外部リンク・mailto・tel・アンカーは含めない", () => {
    const body = `<main><a href="https://example.com/x">外部</a><a href="mailto:a@b.jp">メール</a><a href="tel:0312345678">電話</a><a href="#top">上へ</a><a href="/ok">ok</a></main>`;
    const page = pageFrom(html({ body }));
    expect(page.links.map((l) => l.url)).toEqual([`${ORIGIN}/ok`]);
  });
});

describe("hreflang / OG / パンくず", () => {
  it("hreflang と OG の有無を抜く", () => {
    const head = `<link rel="alternate" hreflang="en" href="/en"><link rel="alternate" hreflang="JA" href="/">
      <meta property="og:title" content="t"><meta property="og:image" content="/i.png">`;
    const page = pageFrom(html({ head }));
    expect(page.hreflang).toEqual(["en", "ja"]);
    expect(page.og).toEqual({ title: true, description: false, image: true });
  });

  it("パンくずは BreadcrumbList かクラス名で判定する", () => {
    const withJsonLd = html({
      head: `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>`,
    });
    const withClass = html({ body: `<nav class="breadcrumb"><a href="/">ホーム</a></nav>` });
    const withAria = html({ body: `<nav aria-label="パンくずリスト"><a href="/">ホーム</a></nav>` });
    expect(pageFrom(withJsonLd).hasBreadcrumb).toBe(true);
    expect(pageFrom(withClass).hasBreadcrumb).toBe(true);
    expect(pageFrom(withAria).hasBreadcrumb).toBe(true);
    expect(pageFrom(html({ body: "<main>本文</main>" })).hasBreadcrumb).toBe(false);
  });
});

describe("日付・著者", () => {
  it("meta → JSON-LD → time 要素の順で公開日を読む", () => {
    const meta = html({ head: `<meta property="article:published_time" content="2025-03-01T10:00:00+09:00">` });
    expect(pageFrom(meta).published).toBe("2025-03-01");

    const ld = html({
      head: `<script type="application/ld+json">{"@type":"BlogPosting","datePublished":"2024-12-24","dateModified":"2026/01/05","author":{"@type":"Person","name":"松下"}}</script>`,
    });
    const ldPage = pageFrom(ld);
    expect(ldPage.published).toBe("2024-12-24");
    expect(ldPage.modified).toBe("2026-01-05");
    expect(ldPage.hasAuthor).toBe(true);

    const time = html({ body: `<main><time datetime="2023-07-07">2023年7月7日</time></main>` });
    expect(pageFrom(time).published).toBe("2023-07-07");
    expect(pageFrom(html({ body: "<main>本文</main>" })).published).toBeNull();
  });

  it("日本語の日付表記と、あり得ない年は弾く", () => {
    expect(toIsoDate("2026年9月13日")).toBe("2026-09-13");
    expect(toIsoDate("1900-01-01")).toBeNull();
    expect(toIsoDate("昨日")).toBeNull();
  });

  it("著者はクラス名や rel=author からも拾う", () => {
    expect(pageFrom(html({ body: `<main><p class="author-name">執筆: 松下</p></main>` })).hasAuthor).toBe(true);
    expect(pageFrom(html({ body: `<main><a rel="author" href="/about">松下</a></main>` })).hasAuthor).toBe(true);
    expect(pageFrom(html({ body: `<main><p>本文だけ</p></main>` })).hasAuthor).toBe(false);
  });
});

describe("連絡先（電話・住所・メール・構造化データ）", () => {
  it("電話番号を数字だけにして重複なしで集める（日付や郵便番号は混ざらない）", () => {
    const body = `<main><p>TEL 03-1234-5678 / 03(1234)5678 / 0120-123-456</p><p>〒060-0001 更新日 2026-09-13</p><a href="tel:+81-3-1234-5678">電話</a></main>`;
    const page = pageFrom(html({ body }));
    expect(page.phones).toEqual(["0312345678", "0120123456"]);
    expect(page.hasPostalAddress).toBe(true);
  });

  it("都道府県 + 市区町村 も住所とみなす", () => {
    expect(pageFrom(html({ body: `<main>東京都千代田区丸の内 1-1-1</main>` })).hasPostalAddress).toBe(true);
    expect(pageFrom(html({ body: `<main>本文だけ</main>` })).hasPostalAddress).toBe(false);
  });

  it("メールは mailto か表記で判定する", () => {
    expect(pageFrom(html({ body: `<main><a href="mailto:info@example.test">メール</a></main>` })).hasEmail).toBe(true);
    expect(pageFrom(html({ body: `<main>info@example.test まで</main>` })).hasEmail).toBe(true);
    expect(pageFrom(html({ body: `<main>本文</main>` })).hasEmail).toBe(false);
  });

  it("Organization 系の構造化データから電話・住所・sameAs を抜く", () => {
    const head = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":"LocalBusiness","name":"サンプル工房","telephone":"+81-3-1234-5678","address":{"@type":"PostalAddress","addressLocality":"千代田区"},"sameAs":["https://x.com/a","https://www.instagram.com/a"]}]}</script>`;
    const page = pageFrom(html({ head }));
    expect(page.organization).toEqual({ type: "LocalBusiness", telephone: "0312345678", hasAddress: true, sameAs: 2 });
    expect(pageFrom(html({ head: `<script type="application/ld+json">{"@type":"Article"}</script>` })).organization).toBeNull();
  });

  it("normalizePhone は 10〜11 桁の 0 始まりだけを通す", () => {
    expect(normalizePhone("+81 90-1234-5678")).toBe("09012345678");
    expect(normalizePhone("1234-5678")).toBeNull();
    expect(normalizePhone("0312345678901")).toBeNull();
  });
});
