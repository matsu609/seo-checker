import { describe, expect, it, vi } from "vitest";
import { fetchDomainFacts } from "../collect";
import { ageYearsFrom, hostFrom, isQueryableDomain, normalizeHost, registrableDomain, sharedPlatformOf } from "../domain";

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

  // 2026-09-23: 共有ドメインの上のサイトをサービス全体と同じドメインとして扱っていた
  it("サイト作成サービス・ブログの上のサイトはサブドメイン 1 つを 1 サイトとみなす", () => {
    expect(registrableDomain("https://sakura-shika.jimdofree.com/")).toBe("sakura-shika.jimdofree.com");
    expect(registrableDomain("https://user.wixsite.com/mysite")).toBe("user.wixsite.com");
    expect(registrableDomain("https://www.example.hatenablog.com/")).toBe("example.hatenablog.com");
    expect(registrableDomain("https://octocat.github.io/")).toBe("octocat.github.io");
    expect(registrableDomain("https://a.b.blog.fc2.com/")).toBe("b.blog.fc2.com");
    expect(registrableDomain("https://ameblo.jp/someone/")).toBe("ameblo.jp");
    expect(sharedPlatformOf("https://sakura-shika.jimdofree.com/")).toBe("jimdofree.com");
    expect(sharedPlatformOf("https://a.b.blog.fc2.com/")).toBe("blog.fc2.com");
    expect(sharedPlatformOf("https://ameblo.jp/someone/")).toBe("ameblo.jp");
    expect(sharedPlatformOf("https://www.example.co.jp/")).toBeNull();
  });

  it("都道府県型 JP ドメインは 3 段目までを登録ドメインにする", () => {
    expect(registrableDomain("https://www.example.tokyo.jp/")).toBe("example.tokyo.jp");
    expect(registrableDomain("https://shop.example.osaka.jp/")).toBe("example.osaka.jp");
    expect(sharedPlatformOf("https://example.tokyo.jp/")).toBeNull();
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

describe("共有ドメインの上のサイトの外部評価", () => {
  it("サービス全体の DR・登録日を問い合わせず、理由を notes に残す", async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("ネットワークに出てはいけない");
    });
    vi.stubGlobal("fetch", fetchSpy);
    try {
      const facts = await fetchDomainFacts("https://sakura-shika.jimdofree.com/", ["https://rival.wixsite.com/shop"]);
      expect(facts.host).toBe("sakura-shika.jimdofree.com");
      expect(facts.ahrefsDr).toBeNull();
      expect(facts.openPageRank).toBeNull();
      expect(facts.registeredAt).toBeNull();
      expect(facts.peers).toEqual([
        { host: "rival.wixsite.com", ahrefsDr: null, openPageRank: null, registeredAt: null, ageYears: null },
      ]);
      expect(facts.notes.some((n) => n.includes("共有ドメイン（jimdofree.com）"))).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
