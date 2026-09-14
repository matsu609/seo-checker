import { describe, expect, it } from "vitest";
import { classifyPage } from "../kinds";

import type { KindInput } from "../kinds";

const base: Omit<KindInput, "url"> = { title: null, h1: [], published: null, jsonLdTypes: [] };
const kind = (url: string, extra: Partial<Omit<KindInput, "url">> = {}) =>
  classifyPage({ url: `https://example.test${url}`, ...base, ...extra });

describe("ページ種別の判定", () => {
  it("URL の区切りで見分ける", () => {
    expect(kind("/")).toBe("home");
    expect(kind("/index.html")).toBe("home");
    expect(kind("/contact/")).toBe("contact");
    expect(kind("/company/profile")).toBe("company");
    expect(kind("/privacy-policy")).toBe("legal");
    expect(kind("/recruit/")).toBe("recruit");
    expect(kind("/service/web")).toBe("service");
    expect(kind("/blog/post-1")).toBe("article");
    expect(kind("/search?q=a")).toBe("not-for-search");
  });

  it("/blog や /category/x は一覧", () => {
    expect(kind("/blog/")).toBe("list");
    expect(kind("/blog/category/seo")).toBe("list");
    expect(kind("/blog/page/2")).toBe("list");
    expect(kind("/2026/09/")).toBe("list");
    expect(kind("/tag/seo")).toBe("list");
  });

  it("URL で分からなければ title / h1 の語で見分ける", () => {
    expect(kind("/p/1", { title: "会社概要 | サンプル工房" })).toBe("company");
    expect(kind("/p/2", { h1: ["お問い合わせ"] })).toBe("contact");
    expect(kind("/p/3", { title: "料金プラン" })).toBe("service");
  });

  it("Article の構造化データや公開日があれば記事、何も無ければ other", () => {
    expect(kind("/p/4", { jsonLdTypes: ["BlogPosting"] })).toBe("article");
    expect(kind("/p/5", { published: "2026-01-01" })).toBe("article");
    expect(kind("/p/6")).toBe("other");
  });
});
