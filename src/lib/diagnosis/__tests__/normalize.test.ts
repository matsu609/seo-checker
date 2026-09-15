/** URL 正規化とクエリ分類（docs/dev/diagnosis-rules-spec.md §6 / §23） */
import { describe, expect, it } from "vitest";
import { brandTerms, isBrandQuery, isHomePath, normalizeUrl, queryIntent } from "../normalize";

describe("正規化する項目", () => {
  it("http と https を同じキーにする", () => {
    expect(normalizeUrl("http://example.com/a")?.key).toBe(normalizeUrl("https://example.com/a")?.key);
  });

  it("www の有無を同じキーにする", () => {
    expect(normalizeUrl("https://www.example.com/a")?.key).toBe(normalizeUrl("https://example.com/a")?.key);
  });

  it("ホストの大文字小文字を揃える", () => {
    expect(normalizeUrl("https://EXAMPLE.com/a")?.key).toBe("example.com/a");
  });

  it("末尾スラッシュを揃える", () => {
    expect(normalizeUrl("https://example.com/a/")?.key).toBe(normalizeUrl("https://example.com/a")?.key);
  });

  it("フラグメントと UTM パラメータを落とす", () => {
    expect(normalizeUrl("https://example.com/a?utm_source=x&gclid=y#top")?.key).toBe("example.com/a");
  });

  it("パラメータの並び順で別 URL にならない", () => {
    expect(normalizeUrl("https://example.com/a?b=2&a=1")?.key).toBe(normalizeUrl("https://example.com/a?a=1&b=2")?.key);
  });
});

describe("自動統合しない項目", () => {
  it(".html の有無は別 URL のまま", () => {
    expect(normalizeUrl("https://example.com/a.html")?.key).not.toBe(normalizeUrl("https://example.com/a")?.key);
  });

  it("言語パスは別 URL のまま", () => {
    expect(normalizeUrl("https://example.com/en/a")?.key).not.toBe(normalizeUrl("https://example.com/a")?.key);
  });

  it("ページネーションや ID のパラメータは残す", () => {
    expect(normalizeUrl("https://example.com/list?page=2")?.key).toBe("example.com/list?page=2");
  });

  it("元の表記は判定用に残す", () => {
    const n = normalizeUrl("https://www.example.com/a.html/");
    expect(n?.www).toBe(true);
    expect(n?.https).toBe(true);
    expect(n?.trailingSlash).toBe(true);
    expect(n?.extension).toBe("html");
  });
});

describe("扱えない入力", () => {
  it("http(s) 以外は null", () => {
    expect(normalizeUrl("mailto:a@example.com")).toBeNull();
    expect(normalizeUrl("tel:0312345678")).toBeNull();
  });

  it("空文字は null", () => {
    expect(normalizeUrl("  ")).toBeNull();
  });

  it("パスだけの入力は origin を足して解釈する（GA4 のランディングページ）", () => {
    expect(normalizeUrl("/service", "https://example.com")?.key).toBe("example.com/service");
  });
});

describe("トップページの判定", () => {
  it("/ と index.html をトップとみなす", () => {
    expect(isHomePath("/")).toBe(true);
    expect(isHomePath("/index.html")).toBe(true);
    expect(isHomePath("/service")).toBe(false);
  });
});

describe("指名検索の判定", () => {
  it("ホスト名とブランド名から語を作る", () => {
    const terms = brandTerms("https://www.sample-koubou.com", "", "株式会社サンプル工房 | 看板製作");
    expect(terms).toContain("sample-koubou");
    expect(terms).toContain("サンプル工房");
  });

  it("空白の有無を無視して照合する", () => {
    expect(isBrandQuery("サンプル 工房 評判", ["サンプル工房"])).toBe(true);
  });

  it("ブランド語が無ければ常に false", () => {
    expect(isBrandQuery("看板 製作", [])).toBe(false);
  });
});

describe("クエリの意図", () => {
  it.each([
    ["看板 製作 費用", "price"],
    ["看板 導入 依頼", "adopt"],
    ["看板 製作 事例", "case"],
    ["看板 業者 比較", "compare"],
    ["デジタルサイネージ とは", "definition"],
    ["看板 剥がれ 直し方", "problem"],
    ["サンプル工房 求人", "recruit"],
    ["サンプル工房 ログイン", "support"],
    ["看板 製作 東京", "place"],
    ["看板", "other"],
  ])("「%s」は %s", (query, intent) => {
    expect(queryIntent(query)).toBe(intent);
  });
});
