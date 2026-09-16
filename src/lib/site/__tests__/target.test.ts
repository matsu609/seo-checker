import { describe, expect, it } from "vitest";
import {
  displayUrl,
  isSameSite,
  isValidSiteUrl,
  pageLabel,
  resolvePageUrl,
  toSiteUrl,
} from "../target";

describe("toSiteUrl", () => {
  it("スキームが無ければ https を補う", () => {
    expect(toSiteUrl("example.co.jp")).toBe("https://example.co.jp/");
    expect(toSiteUrl("  www.example.co.jp  ")).toBe("https://www.example.co.jp/");
  });

  it("パス・クエリは落としてトップページにする", () => {
    expect(toSiteUrl("https://example.co.jp/service/?a=1")).toBe("https://example.co.jp/");
    expect(toSiteUrl("http://example.co.jp:8080/a")).toBe("http://example.co.jp:8080/");
  });

  it("空・ホストでないもの・http(s) 以外は空文字", () => {
    expect(toSiteUrl("")).toBe("");
    expect(toSiteUrl("   ")).toBe("");
    expect(toSiteUrl("localhost")).toBe("");
    expect(toSiteUrl("ftp://example.co.jp/")).toBe("");
    expect(toSiteUrl("ただの文字列")).toBe("");
  });

  it("isValidSiteUrl は toSiteUrl が空かどうか", () => {
    expect(isValidSiteUrl("example.com")).toBe(true);
    expect(isValidSiteUrl("example")).toBe(false);
  });
});

describe("resolvePageUrl", () => {
  const site = "https://example.co.jp/";

  it("空ならトップページ", () => {
    expect(resolvePageUrl(site, "")).toBe(site);
    expect(resolvePageUrl(site, "   ")).toBe(site);
  });

  it("パスは登録サイトからの相対で解決する", () => {
    expect(resolvePageUrl(site, "/service/")).toBe("https://example.co.jp/service/");
    expect(resolvePageUrl(site, "service")).toBe("https://example.co.jp/service");
  });

  it("絶対 URL はそのまま", () => {
    expect(resolvePageUrl(site, "https://other.jp/a")).toBe("https://other.jp/a");
  });

  it("スキーム無しのホストは別サイトとして扱う", () => {
    expect(resolvePageUrl(site, "other.jp/a")).toBe("https://other.jp/a");
  });

  it("サイト未登録で入力も無ければ null", () => {
    expect(resolvePageUrl("", "")).toBeNull();
    expect(resolvePageUrl("", "/service/")).toBeNull();
  });

  it("http(s) 以外は null", () => {
    expect(resolvePageUrl(site, "javascript://example.co.jp/")).toBeNull();
  });
});

describe("isSameSite / displayUrl / pageLabel", () => {
  it("同じホストかを見る", () => {
    expect(isSameSite("example.co.jp", "https://example.co.jp/a")).toBe(true);
    expect(isSameSite("example.co.jp", "https://www.example.co.jp/a")).toBe(false);
    expect(isSameSite("", "https://example.co.jp/")).toBe(false);
  });

  it("表示用はスキームと末尾の / を落とす", () => {
    expect(displayUrl("https://example.co.jp/")).toBe("example.co.jp");
    expect(displayUrl("https://example.co.jp/service/")).toBe("example.co.jp/service");
  });

  it("同じサイトならパスだけ、別サイトならホスト付き", () => {
    expect(pageLabel("https://example.co.jp/", "https://example.co.jp/service/")).toBe("/service/");
    expect(pageLabel("https://example.co.jp/", "https://other.jp/a")).toBe("other.jp/a");
    expect(pageLabel("https://example.co.jp/", "")).toBe("");
  });
});
