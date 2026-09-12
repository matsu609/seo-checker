import { describe, expect, it } from "vitest";
import { isHomePage, notForSearch } from "../page-kind";

describe("isHomePage", () => {
  it("/ と /index.* をトップページとみなす", () => {
    expect(isHomePage("https://example.com/")).toBe(true);
    expect(isHomePage("https://example.com/index.html")).toBe(true);
    expect(isHomePage("https://example.com/index.php")).toBe(true);
  });

  it("下層ページはトップページではない", () => {
    expect(isHomePage("https://example.com/company")).toBe(false);
    expect(isHomePage("https://example.com/index.html/child")).toBe(false);
  });

  it("URL として読めない文字列は false", () => {
    expect(isHomePage("not a url")).toBe(false);
  });
});

describe("notForSearch", () => {
  it("サイト内検索の結果ページ（パス・クエリの両方）", () => {
    expect(notForSearch("https://example.com/search")?.kind).toBe("search");
    expect(notForSearch("https://example.com/search/?page=2")?.kind).toBe("search");
    expect(notForSearch("https://example.com/products/search")?.kind).toBe("search");
    expect(notForSearch("https://example.com/search.php")?.kind).toBe("search");
    // WordPress の既定（/?s=キーワード）
    expect(notForSearch("https://example.com/?s=%E6%A4%9C%E7%B4%A2")?.kind).toBe("search");
    expect(notForSearch("https://example.com/list?q=seo")?.kind).toBe("search");
  });

  it("買い物かご・ログイン・完了・印刷用のページ", () => {
    expect(notForSearch("https://example.com/cart")?.kind).toBe("cart");
    expect(notForSearch("https://example.com/shop/checkout")?.kind).toBe("cart");
    expect(notForSearch("https://example.com/login")?.kind).toBe("account");
    expect(notForSearch("https://example.com/mypage/orders")?.kind).toBe("account");
    expect(notForSearch("https://example.com/contact/thanks")?.kind).toBe("thanks");
    expect(notForSearch("https://example.com/news/1?print=1")?.kind).toBe("duplicate");
  });

  it("画面に出す名前と理由を返す", () => {
    const r = notForSearch("https://example.com/search");
    expect(r?.label).toBe("サイト内検索の結果ページ");
    expect(r?.reason).toContain("検索結果ページを検索に登録しないよう");
  });

  // 誤って「意図した設定」と判定すると、本物の問題を見逃す。
  // 用途が読み取れない URL は null（= 減点の対象に戻す）
  it("ふつうの公開ページは null", () => {
    expect(notForSearch("https://example.com/")).toBeNull();
    expect(notForSearch("https://example.com/company")).toBeNull();
    expect(notForSearch("https://example.com/service/price")).toBeNull();
    expect(notForSearch("https://example.com/blog/2026/seo-research")).toBeNull();
    // 語の一部が一致するだけでは該当しない
    expect(notForSearch("https://example.com/research")).toBeNull();
    expect(notForSearch("https://example.com/cartridge")).toBeNull();
    expect(notForSearch("not a url")).toBeNull();
  });
});
