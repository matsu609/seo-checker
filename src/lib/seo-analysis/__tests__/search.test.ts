import { describe, expect, it } from "vitest";
import type { SerpProvider, SerpQuery, SerpResult } from "@/lib/serp/types";
import { collectSearch, guessBrand, hostOf, rankOf, topDomains } from "../search";

function result(q: string, urls: string[], extra: Partial<SerpResult> = {}): SerpResult {
  return {
    query: q,
    device: "mobile",
    organic: urls.map((url, i) => ({ position: i + 1, title: url, url })),
    features: [],
    aiOverview: null,
    relatedQuestions: [],
    relatedSearches: [],
    totalResults: null,
    fetchedAt: "2026-09-14",
    provider: "test",
    raw: null,
    ...extra,
  };
}

describe("検索での見え方", () => {
  it("自社の順位と上位ドメイン", () => {
    const r = result("kw", ["https://a.jp/1", "https://www.b.jp/2", "https://a.jp/3", "https://blog.example.test/x", "https://example.test/y"]);
    expect(rankOf(r, "example.test")).toEqual({ rank: 4, url: "https://blog.example.test/x" });
    expect(rankOf(r, "none.test")).toEqual({ rank: null, url: null });
    expect(topDomains(r)).toEqual(["a.jp", "b.jp", "blog.example.test"]);
    expect(hostOf("https://www.Example.test/")).toBe("example.test");
  });

  it("ブランド名は入力 → title のサイト名の順", () => {
    expect(guessBrand("入力名", "x | y")).toBe("入力名");
    expect(guessBrand("", "ウェブ制作の料金 | サンプル工房")).toBe("サンプル工房");
    expect(guessBrand("", "サンプル工房")).toBe("サンプル工房");
    expect(guessBrand("", null)).toBe("");
  });

  it("キーワードごとの順位・site: 件数・ブランド検索を集める", async () => {
    const queries: SerpQuery[] = [];
    const provider: SerpProvider = {
      name: "test",
      async search(q) {
        queries.push(q);
        if (q.q.startsWith("site:")) return result(q.q, [], { totalResults: 120 });
        if (q.q === "サンプル工房") return result(q.q, ["https://example.test/"]);
        return result(q.q, ["https://rival.jp/a", "https://example.test/service"], {
          features: ["ai_overview"],
          aiOverview: { text: "…", references: [{ url: "https://rival.jp/a", title: "a" }] },
        });
      },
    };
    const { search, enabled } = await collectSearch({ origin: "https://example.test", keywords: ["kw1", "", "kw1"], competitors: ["https://rival.jp/"], brand: "", homeTitle: "トップ | サンプル工房", provider });
    expect(enabled).toBe(true);
    expect(search.keywords).toHaveLength(1);
    expect(search.keywords[0]).toMatchObject({ keyword: "kw1", rank: 2, aiOverview: true, ownCited: false, competitors: [{ host: "rival.jp", rank: 1 }] });
    expect(search.siteCount).toBe(120);
    expect(search.brand).toEqual({ query: "サンプル工房", rank: 1, url: "https://example.test/" });
    expect(queries.map((q) => q.q)).toEqual(["kw1", "site:example.test", "サンプル工房"]);
  });

  it("プロバイダが無ければ何もせず注記だけ", async () => {
    const { search, enabled } = await collectSearch({ origin: "https://example.test", keywords: ["a"], competitors: [], brand: "", homeTitle: null, provider: null });
    expect(enabled).toBe(false);
    expect(search.keywords).toEqual([]);
    expect(search.notes[0]).toContain("SERPAPI_KEY");
  });
});
