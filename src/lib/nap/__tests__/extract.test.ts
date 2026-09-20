import { describe, expect, it } from "vitest";
import { addressToString, extractAddresses, extractNap, organizationsFromJsonLd } from "../extract";

const HTML = `<!doctype html><html><head><title>ウルフ情報 | 渋谷の IT サポート</title>
<meta property="og:site_name" content="株式会社ウルフ情報">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"site"},{"@type":"LocalBusiness","name":"株式会社ウルフ情報","telephone":"+81-3-1234-5678","url":"https://example.co.jp/","address":{"@type":"PostalAddress","postalCode":"150-0041","addressRegion":"東京都","addressLocality":"渋谷区","streetAddress":"神南1-2-3 ウルフビル4F"}}]}</script>
</head><body>
<nav><a href="/company/">会社概要</a><a href="/contact">お問い合わせ</a><a href="/blog/">ブログ</a><a href="https://twitter.com/wolf">X</a><a href="https://www.instagram.com/wolf">Instagram</a></nav>
<main><p>渋谷の IT サポート。</p><script>var x = "03-0000-0000";</script></main>
<footer>〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F　TEL <a href="tel:03-1234-5678">03-1234-5678</a> FAX 03-1234-5679<br>© 2026 株式会社ウルフ情報 All rights reserved.</footer>
</body></html>`;

describe("HTML から NAP を抜く", () => {
  it("構造化データ・電話・住所・店名の候補・辿るページ・外部リンク", () => {
    const r = extractNap(HTML, "https://example.co.jp/");
    expect(r.jsonLd).toEqual([{ type: "LocalBusiness", name: "株式会社ウルフ情報", telephone: "+81-3-1234-5678", address: "〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F", url: "https://example.co.jp/" }]);
    expect(r.phones).toContain("0312345678");
    expect(r.phones).toContain("0312345679");
    // script の中の番号は拾わない
    expect(r.phones).not.toContain("0300000000");
    expect(r.addresses[0]).toBe("〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F");
    expect(r.names).toContain("株式会社ウルフ情報");
    expect(r.names).toContain("ウルフ情報");
    expect(r.candidatePages.map((c) => c.url)).toEqual(["https://example.co.jp/company/", "https://example.co.jp/contact"]);
    expect(r.candidatePages[0]).toMatchObject({ text: "会社概要", score: 3 });
    expect(r.externalLinks).toEqual(["https://twitter.com/wolf", "https://www.instagram.com/wolf"]);
    expect(r.text).toContain("渋谷の IT サポート");
  });

  it("壊れた JSON-LD は無視して続ける", () => {
    const r = extractNap('<html><head><script type="application/ld+json">{broken</script></head><body>x</body></html>', "https://a.jp/");
    expect(r.jsonLd).toEqual([]);
  });

  it("publisher の中の Organization も拾う。schema.org の URL 付きの型も", () => {
    const orgs = organizationsFromJsonLd({ "@type": "Article", publisher: { "@type": "https://schema.org/Organization", name: "ウルフ情報", url: "https://a.jp" } });
    expect(orgs).toEqual([{ type: "https://schema.org/Organization", name: "ウルフ情報", telephone: null, address: null, url: "https://a.jp" }]);
    expect(organizationsFromJsonLd({ "@type": "WebPage" })).toEqual([]);
  });

  it("PostalAddress → 1 行", () => {
    expect(addressToString({ addressRegion: "東京都", addressLocality: "渋谷区", streetAddress: "神南1-2-3" })).toBe("東京都渋谷区神南1-2-3");
    expect(addressToString("東京都渋谷区神南1-2-3")).toBe("東京都渋谷区神南1-2-3");
    expect(addressToString({ addressCountry: "JP" })).toBeNull();
    expect(addressToString(null)).toBeNull();
  });

  it("本文から住所らしい行を抜く（TEL・営業時間・会社名・Copyright で止める。番地のあとは 2 語まで）", () => {
    const list = extractAddresses("所在地 東京都渋谷区神南1-2-3 ウルフビル4F TEL 03-1234-5678 営業時間 10:00〜19:00 大阪府大阪市北区梅田1-1-1（大阪店）");
    expect(list[0]).toBe("東京都渋谷区神南1-2-3 ウルフビル4F");
    expect(list[1]).toBe("大阪府大阪市北区梅田1-1-1");
    expect(extractAddresses("〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F 株式会社ウルフ情報 Copyright 2026")).toEqual(["〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F"]);
    expect(extractAddresses("東京都渋谷区神南1-2-3 ウルフビル 4F 受付は 3F です")).toEqual(["東京都渋谷区神南1-2-3 ウルフビル 4F"]);
    // 続く文が 1 語なら残る（建物名の前方一致で吸収する。compare.test を参照）
    expect(extractAddresses("東京都渋谷区神南1-2-3 ウルフビル4F お客様のご来店をお待ちしております 03-1234-5678")).toEqual(["東京都渋谷区神南1-2-3 ウルフビル4F お客様のご来店をお待ちしております"]);
  });
});
