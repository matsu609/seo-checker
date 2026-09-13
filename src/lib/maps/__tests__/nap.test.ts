import { describe, expect, it } from "vitest";
import { compareSiteNap, extractSiteNap } from "../nap";

const GOOGLE = {
  name: "サンプル美容室 渋谷店",
  address: "日本、〒150-0002 東京都渋谷区渋谷1-2-3 サンプルビル 4F",
  phone: "03-1234-5678",
};
const NOW = new Date("2026-09-13T00:00:00Z");

describe("サイトからの NAP 読み取り", () => {
  it("JSON-LD（LocalBusiness）から店名・住所・電話を取る", () => {
    const html = `<html><head><title>トップ | サンプル</title><script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "サンプル美容室 渋谷店",
      telephone: "03-1234-5678",
      address: { "@type": "PostalAddress", postalCode: "150-0002", addressRegion: "東京都", addressLocality: "渋谷区", streetAddress: "渋谷1-2-3 サンプルビル 4F" },
    })}</script></head><body>本文</body></html>`;
    const nap = extractSiteNap(html);
    expect(nap.name).toEqual({ value: "サンプル美容室 渋谷店", source: "json-ld" });
    expect(nap.phone?.value).toBe("03-1234-5678");
    expect(nap.address?.value).toContain("渋谷1-2-3");
  });

  it("JSON-LD が無ければ本文から電話番号と住所を拾い、店名はタイトルから取る", () => {
    const html = `<html><head><title>サンプル美容室 渋谷店 | 渋谷の美容室</title></head><body>
      <p>東京都渋谷区渋谷1-2-3 サンプルビル 4F</p><p>TEL 03-1234-5678</p></body></html>`;
    const nap = extractSiteNap(html);
    expect(nap.name).toEqual({ value: "サンプル美容室 渋谷店", source: "本文" });
    expect(nap.phone).toEqual({ value: "03-1234-5678", source: "本文" });
    expect(nap.address?.source).toBe("本文");
    expect(nap.address?.value).toContain("東京都渋谷区");
  });

  it("パンくずなど店舗以外の JSON-LD は見ない", () => {
    const html = `<html><head><title>会社概要</title><script type="application/ld+json">${JSON.stringify({
      "@type": "BreadcrumbList",
      name: "パンくず",
      itemListElement: [],
    })}</script></head><body>本文だけ</body></html>`;
    expect(extractSiteNap(html).name?.value).toBe("会社概要");
  });

  it("壊れた JSON-LD があっても落ちない", () => {
    const html = `<html><head><title>店</title><script type="application/ld+json">{壊れています</script></head><body></body></html>`;
    expect(() => extractSiteNap(html)).not.toThrow();
  });
});

describe("Google との突き合わせ", () => {
  it("表記ゆれ（全角・ハイフン・「日本、〒」）は一致とみなす", () => {
    const site = {
      name: { value: "サンプル美容室　渋谷店", source: "json-ld" as const },
      address: { value: "東京都渋谷区渋谷1-2-3 サンプルビル 4F", source: "json-ld" as const },
      phone: { value: "０３−１２３４−５６７８", source: "json-ld" as const },
    };
    const result = compareSiteNap(site, GOOGLE, "https://example.com/", NOW);
    expect(result.mismatches).toBe(0);
    expect(result.findings.every((f) => f.status === "match")).toBe(true);
  });

  it("違う電話番号・違う住所は食い違いとして出す", () => {
    const site = {
      name: { value: "サンプル美容室 渋谷店", source: "json-ld" as const },
      address: { value: "東京都新宿区西新宿9-9-9", source: "json-ld" as const },
      phone: { value: "03-9999-0000", source: "本文" as const },
    };
    const result = compareSiteNap(site, GOOGLE, "https://example.com/", NOW);
    expect(result.mismatches).toBe(2);
    expect(result.findings.filter((f) => f.status === "mismatch").map((f) => f.field).sort()).toEqual(["address", "phone"]);
  });

  it("サイトに書かれていない項目は「見つからない」として出す", () => {
    const result = compareSiteNap({ name: null, address: null, phone: null }, GOOGLE, "https://example.com/", NOW);
    expect(result.findings.every((f) => f.status === "missing")).toBe(true);
    expect(result.mismatches).toBe(0);
  });
});
