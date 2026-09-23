import { describe, expect, it } from "vitest";
import { addressBuilding, compareAddress, compareName, comparePhone, compareWebsite, formatPhone, nameInText, normalizeName, normalizeUrl, sameAddress, sameName, samePhone, sameWebsite, stripCorporate, websiteInLinks } from "../compare";

describe("2 つの値の突き合わせ（サイト ⇔ Google・基本情報 ⇔ Google が使う。2026-09-23）", () => {
  const GOOGLE_ADDRESS = "日本、〒150-0041 東京都渋谷区神南１丁目２−３";

  it("住所: 丁目 / 番地の書き方・「日本、〒」・都道府県や市区町村の省略は同じ。どちらを先に渡しても同じ答え", () => {
    for (const other of ["東京都渋谷区神南1-2-3", "渋谷区神南1丁目2番3号", "神南1-2-3", "〒150-0041 東京都渋谷区神南1丁目2-3"]) {
      expect(sameAddress(other, GOOGLE_ADDRESS)).toBe(true);
      expect(sameAddress(GOOGLE_ADDRESS, other)).toBe(true);
    }
    expect(sameAddress("東京都渋谷区神南1-2-4", GOOGLE_ADDRESS)).toBe(false);
    expect(sameAddress("東京都渋谷区神南1-2-3 Aビル", "東京都渋谷区神南1-2-3 Bビル")).toBe(false);
  });

  it("電話: +81・区切りなし・全角は同じ", () => {
    expect(samePhone("+81-3-1234-5678", "03-1234-5678")).toBe(true);
    expect(samePhone("0312345678", "03-1234-5678")).toBe(true);
    expect(samePhone("０３（１２３４）５６７８", "03-1234-5678")).toBe(true);
    expect(samePhone("03-1234-5679", "03-1234-5678")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });

  it("店名・サイト", () => {
    expect(sameName("(株)ウルフ 情報", "株式会社ウルフ情報")).toBe(true);
    expect(sameName("ウルフ情報 渋谷店", "ウルフ情報")).toBe(false);
    expect(sameWebsite("http://www.example.com", "https://example.com/?utm_source=gbp")).toBe(true);
    expect(sameWebsite("https://example.com/", "https://other.example.jp/")).toBe(false);
  });
});

describe("店名の正規化と照合", () => {
  it("全角 / 半角・空白・中黒・法人格の略記をそろえる", () => {
    expect(normalizeName("（株）ウルフ　情報")).toBe("株式会社ウルフ情報");
    expect(normalizeName("㈱ウルフ・情報")).toBe("株式会社ウルフ情報");
    expect(normalizeName("ＷＯＬＦ Info")).toBe("wolfinfo");
    expect(stripCorporate("株式会社ウルフ情報")).toBe("ウルフ情報");
  });

  it("同じ名前なら一致、法人格の有無だけなら不一致（理由つき）、別名は不一致", () => {
    expect(compareName("株式会社ウルフ情報", ["(株)ウルフ 情報"]).status).toBe("match");
    const corp = compareName("株式会社ウルフ情報", ["ウルフ情報"]);
    expect(corp.status).toBe("mismatch");
    expect(corp.note).toMatch(/法人格/);
    const branch = compareName("ウルフ情報", ["ウルフ情報 渋谷店"]);
    expect(branch.status).toBe("mismatch");
    expect(branch.note).toMatch(/支店名/);
    expect(compareName("ウルフ情報", ["別の会社"])).toMatchObject({ status: "mismatch", found: "別の会社" });
    expect(compareName("ウルフ情報", []).status).toBe("missing");
    expect(compareName("", ["x"]).status).toBe("skipped");
  });

  it("本文に店名が出ているか", () => {
    expect(nameInText("株式会社ウルフ情報", "Copyright 株式会社 ウルフ情報 All rights reserved").status).toBe("match");
    expect(nameInText("株式会社ウルフ情報", "ウルフ情報のサイトです").status).toBe("mismatch");
    expect(nameInText("株式会社ウルフ情報", "無関係な文").status).toBe("missing");
  });
});

describe("電話番号の照合", () => {
  it("数字だけで比べる（+81・全角・ハイフン違いは一致）", () => {
    expect(comparePhone("03-1234-5678", ["0312345678"]).status).toBe("match");
    expect(comparePhone("０３（１２３４）５６７８", ["0312345678"]).status).toBe("match");
    expect(comparePhone("+81 3-1234-5678", ["0312345678"]).status).toBe("match");
    const r = comparePhone("03-1234-5678", ["0398765432"]);
    expect(r.status).toBe("mismatch");
    expect(r.found).toBe("03-9876-5432");
    expect(comparePhone("03-1234-5678", []).status).toBe("missing");
    expect(comparePhone("12", ["0312345678"]).status).toBe("skipped");
  });

  it("表示形", () => {
    expect(formatPhone("09012345678")).toBe("090-1234-5678");
    expect(formatPhone("0312345678")).toBe("03-1234-5678");
    expect(formatPhone("0451234567")).toBe("0451234567");
  });
});

describe("住所の照合", () => {
  const expected = "〒150-0041 東京都渋谷区神南1-2-3 ウルフビル4F";

  it("建物名を切り出す", () => {
    expect(addressBuilding(expected)).toBe("ウルフビル4F");
    expect(addressBuilding("東京都渋谷区神南1-2-3")).toBe("");
  });

  it("番地まで同じなら一致（丁目・番地の書き方、全角、〒 の有無は無視）", () => {
    expect(compareAddress(expected, ["東京都渋谷区神南１丁目２番３号 ウルフビル４Ｆ"]).status).toBe("match");
    expect(compareAddress(expected, ["東京都渋谷区神南1-2-3"])).toMatchObject({ status: "match", note: expect.stringMatching(/建物名/) });
    // 都道府県を省いた表記（媒体のページに多い）
    expect(compareAddress(expected, ["渋谷区神南1-2-3 ウルフビル4F"]).status).toBe("match");
    // ページ側の建物名のあとに会社名などが続いていても、前方が同じなら一致
    expect(compareAddress(expected, ["東京都渋谷区神南1-2-3 ウルフビル4F 株式会社ウルフ情報"]).status).toBe("match");
  });

  it("建物名が違えば不一致（理由つき）、番地が違えば不一致", () => {
    const b = compareAddress(expected, ["東京都渋谷区神南1-2-3 別ビル2F"]);
    expect(b.status).toBe("mismatch");
    expect(b.note).toMatch(/建物名/);
    const partial = compareAddress(expected, ["東京都渋谷区神南1-2"]);
    expect(partial.status).toBe("mismatch");
    expect(partial.note).toMatch(/番地の書き方/);
    expect(compareAddress(expected, ["大阪府大阪市北区梅田1-1-1"])).toMatchObject({ status: "mismatch", note: "別の住所が書かれています" });
    expect(compareAddress(expected, []).status).toBe("missing");
    expect(compareAddress("", ["x"]).status).toBe("skipped");
  });
});

describe("サイト URL の照合", () => {
  it("スキーム・www・末尾のスラッシュ・大文字は無視", () => {
    expect(normalizeUrl("HTTP://www.Example.co.jp/")).toEqual({ host: "example.co.jp", path: "" });
    expect(normalizeUrl("example.co.jp/about/")).toEqual({ host: "example.co.jp", path: "/about" });
    expect(normalizeUrl("")).toBeNull();
    expect(compareWebsite("https://www.example.co.jp/", ["http://example.co.jp"]).status).toBe("match");
    expect(compareWebsite("https://example.co.jp/", ["https://example.co.jp/shop/"])).toMatchObject({ status: "match", note: expect.stringMatching(/ページが違います/) });
    expect(compareWebsite("https://example.co.jp/", ["https://other.jp/"])).toMatchObject({ status: "mismatch" });
    expect(compareWebsite("https://example.co.jp/", []).status).toBe("missing");
    expect(compareWebsite("", ["x"]).status).toBe("skipped");
  });

  it("媒体のページに自社サイトのリンクがあるか（無くても別サイトとは言わない）", () => {
    expect(websiteInLinks("https://example.co.jp/", ["https://maps.google.com/", "https://www.example.co.jp/shop"]).status).toBe("match");
    expect(websiteInLinks("https://example.co.jp/", ["https://other.jp/"]).status).toBe("missing");
    expect(websiteInLinks("", ["https://other.jp/"]).status).toBe("skipped");
  });
});
