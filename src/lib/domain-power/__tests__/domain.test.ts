import { describe, expect, it } from "vitest";
import { ageYearsFrom, hostFrom, isQueryableDomain, normalizeHost, registrableDomain } from "../domain";

describe("登録ドメインの取り出し", () => {
  it("URL でもホスト名でも同じ結果になる", () => {
    expect(registrableDomain("https://www.example.com/path?a=1")).toBe("example.com");
    expect(registrableDomain("www.example.com")).toBe("example.com");
    expect(registrableDomain("example.com")).toBe("example.com");
  });

  it("国別 TLD の第 2 レベルを 1 段深く見る", () => {
    expect(registrableDomain("https://shop.example.co.jp/")).toBe("example.co.jp");
    expect(registrableDomain("https://www.example.or.jp/")).toBe("example.or.jp");
    expect(registrableDomain("https://news.example.co.uk/")).toBe("example.co.uk");
    expect(registrableDomain("https://a.b.example.com.au/")).toBe("example.com.au");
  });

  it("サブドメインは落とす", () => {
    expect(registrableDomain("https://blog.shop.example.jp/")).toBe("example.jp");
    expect(registrableDomain("https://a.b.c.example.tokyo/")).toBe("example.tokyo");
  });

  it("読めない入力では空文字", () => {
    expect(registrableDomain("")).toBe("");
    expect(registrableDomain("   ")).toBe("");
  });

  it("www と末尾ドットと大文字を揃える", () => {
    expect(normalizeHost("WWW.Example.COM.")).toBe("example.com");
    expect(hostFrom("HTTPS://WWW.Example.com/A")).toBe("example.com");
  });

  it("問い合わせてよいドメインだけ通す", () => {
    expect(isQueryableDomain("example.com")).toBe(true);
    expect(isQueryableDomain("例え.jp")).toBe(true);
    expect(isQueryableDomain("example")).toBe(false);
    expect(isQueryableDomain("example.com/path")).toBe(false);
    expect(isQueryableDomain("../etc/passwd")).toBe(false);
    expect(isQueryableDomain("")).toBe(false);
  });
});

describe("ドメインの年数", () => {
  const now = new Date("2026-09-15T00:00:00.000Z");

  it("登録日から年数を出す", () => {
    expect(ageYearsFrom("2016-09-15T00:00:00.000Z", now)).toBeCloseTo(10, 1);
    expect(ageYearsFrom("2026-03-15T00:00:00.000Z", now)).toBeCloseTo(0.5, 1);
  });

  it("読めない日付・未来の日付は null", () => {
    expect(ageYearsFrom(null, now)).toBeNull();
    expect(ageYearsFrom("いつか", now)).toBeNull();
    expect(ageYearsFrom("2030-01-01T00:00:00.000Z", now)).toBeNull();
  });
});
