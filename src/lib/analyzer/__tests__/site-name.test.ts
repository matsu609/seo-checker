import { describe, expect, it } from "vitest";
import { guessSiteName, splitTitle } from "../site-name";
import { siteNameFrom } from "@/lib/llms-txt/scan";
import { guessBrand } from "@/lib/seo-analysis/search";

/**
 * サイト名の推測（2026-09-23 に 1 つのルールへまとめた）。
 * 以前は精密診断のブランド名が最後の要素、llms.txt のサイト名が最初の要素で、
 * 同じトップページから別の名前を出していた。
 */
describe("splitTitle", () => {
  it("全角の区切りはどこでも、半角のハイフンとコロンは前後に空白があるときだけ割る", () => {
    expect(splitTitle("サンプル工房｜制作")).toEqual(["サンプル工房", "制作"]);
    expect(splitTitle("A | B — C")).toEqual(["A", "B", "C"]);
    expect(splitTitle("e-Tax 対応 - 税理士事務所")).toEqual(["e-Tax 対応", "税理士事務所"]);
    expect(splitTitle("Wi-Fi の設定")).toEqual(["Wi-Fi の設定"]);
  });
});

describe("guessSiteName", () => {
  it("下層ページの title に共通する要素を最優先する", () => {
    expect(guessSiteName("東京の歯医者なら｜さくら歯科", ["診療案内｜さくら歯科", "アクセス｜さくら歯科"])).toBe("さくら歯科");
    expect(guessSiteName("さくら歯科｜東京の歯医者", ["診療案内｜さくら歯科"])).toBe("さくら歯科");
  });

  it("手がかりが無ければ会社名らしい要素、それも無ければ最初の要素", () => {
    expect(guessSiteName("東京のリフォーム｜山田工務店")).toBe("山田工務店");
    expect(guessSiteName("Example Inc. | Cloud tools")).toBe("Example Inc.");
    expect(guessSiteName("サンプル工房｜中小企業のウェブサイト制作")).toBe("サンプル工房");
  });

  it("長すぎる要素は名前とみなさない", () => {
    expect(guessSiteName("あ".repeat(40))).toBe("");
    expect(guessSiteName(`${"あ".repeat(40)}｜短い名前`)).toBe("短い名前");
    expect(guessSiteName(null)).toBe("");
  });

  it("精密診断のブランド名と llms.txt のサイト名が同じ名前になる", () => {
    const home = "ウェブ制作の料金 | サンプル工房";
    const others = ["会社概要 | サンプル工房"];
    expect(guessBrand("", home, others)).toBe(siteNameFrom(home, "https://example.test", others));
    expect(guessBrand("", home)).toBe(siteNameFrom(home, "https://example.test"));
  });
});
