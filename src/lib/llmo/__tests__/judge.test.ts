/**
 * 言及判定・引用判定（表記ゆれ・サブドメイン・未分類）。
 */
import { describe, expect, it } from "vitest";
import { hostnameOf, judgeAnswer, judgeEntity, matchedAliases, matchesDomain, normalizeText } from "../judge";
import type { LlmoEntity } from "../types";

const self: LlmoEntity = {
  id: "self",
  name: "サンプル株式会社",
  domains: ["example.co.jp"],
  brandAliases: ["ユーザーローカル", "User Local", "UserLocal"],
  isSelf: true,
};

const rival: LlmoEntity = {
  id: "rival",
  name: "競合A",
  domains: ["https://www.rival.example.com/company"],
  brandAliases: ["競合A"],
};

describe("normalizeText", () => {
  it("全角英数・大文字小文字・空白・中黒・ハイフンを吸収する", () => {
    expect(normalizeText("Ｕｓｅｒ Ｌｏｃａｌ")).toBe("userlocal");
    expect(normalizeText("ユーザー・ローカル")).toBe("ユーザーローカル");
    expect(normalizeText("User-Local")).toBe("userlocal");
    expect(normalizeText("株式会社サンプル（東京）")).toBe("株式会社サンプル東京");
  });

  it("長音符は落とさない（ユーザー ≠ ユザ）", () => {
    expect(normalizeText("ユーザー")).toBe("ユーザー");
  });
});

describe("matchedAliases", () => {
  it("表記が違っても別名として拾う", () => {
    expect(matchedAliases("私は ＵＳＥＲ ＬＯＣＡＬ を使っています", self.brandAliases)).toContain("User Local");
    expect(matchedAliases("ユーザー・ローカルが有名です", self.brandAliases)).toContain("ユーザーローカル");
  });

  it("1 文字の別名は誤検知を避けるため採らない", () => {
    expect(matchedAliases("あいうえお", ["あ"])).toEqual([]);
  });

  it("含まれなければ空", () => {
    expect(matchedAliases("他社の話しかしていません", self.brandAliases)).toEqual([]);
  });
});

describe("matchesDomain / hostnameOf", () => {
  it("www の有無とサブドメインを吸収する", () => {
    expect(hostnameOf("https://www.example.co.jp/a/b?c=1")).toBe("example.co.jp");
    expect(matchesDomain("blog.example.co.jp", ["example.co.jp"])).toBe("example.co.jp");
    expect(matchesDomain("www.example.co.jp", ["https://example.co.jp/"])).toBe("example.co.jp");
  });

  it("部分一致では一致しない", () => {
    expect(matchesDomain("notexample.co.jp", ["example.co.jp"])).toBeNull();
    expect(matchesDomain("example.co.jp", ["blog.example.co.jp"])).toBeNull();
  });

  it("スキーム無しの登録ドメインも受け付ける", () => {
    expect(matchesDomain("news.rival.example.com", [rival.domains[0]])).toBe("rival.example.com");
  });

  it("URL として壊れていても落ちない", () => {
    expect(hostnameOf("   ")).toBeNull();
    expect(hostnameOf("http://")).toBeNull();
  });
});

describe("judgeEntity", () => {
  it("言及と引用を別々に判定する", () => {
    const j = judgeEntity(
      "おすすめは ＵｓｅｒＬｏｃａｌ です。",
      [{ url: "https://blog.example.co.jp/post", title: "記事" }],
      self,
    );
    expect(j.brandMentioned).toBe(true);
    expect(j.domainCited).toBe(true);
    expect(j.matchedDomains).toEqual(["example.co.jp"]);
  });

  it("引用だけ・言及だけの状態も表せる", () => {
    const onlyCited = judgeEntity("特にありません", [{ url: "https://example.co.jp/", title: null }], self);
    expect(onlyCited.brandMentioned).toBe(false);
    expect(onlyCited.domainCited).toBe(true);

    const onlyMentioned = judgeEntity("User Local が有名です", [], self);
    expect(onlyMentioned.brandMentioned).toBe(true);
    expect(onlyMentioned.domainCited).toBe(false);
  });
});

describe("judgeAnswer", () => {
  const citations = [
    { url: "https://example.co.jp/a", title: "自社" },
    { url: "https://www.rival.example.com/b", title: "競合" },
    { url: "https://note.example.net/c", title: "まとめ記事" },
    { url: "https://note.example.net/d", title: "まとめ記事 2" },
    { url: "not a url", title: null },
  ];

  it("どの会社にも一致しない引用を未分類に集める", () => {
    const { judgements, unclassified } = judgeAnswer("競合A も User Local も出てきます", citations, [self, rival]);
    expect(judgements.map((j) => j.entityId)).toEqual(["self", "rival"]);
    expect(judgements.every((j) => j.brandMentioned && j.domainCited)).toBe(true);
    expect(unclassified).toEqual([
      { domain: "note.example.net", count: 2, sampleUrl: "https://note.example.net/c", sampleTitle: "まとめ記事" },
    ]);
  });

  it("会社が未登録なら全部が未分類になる", () => {
    const { judgements, unclassified } = judgeAnswer("本文", citations, []);
    expect(judgements).toEqual([]);
    expect(unclassified.map((u) => u.domain)).toEqual(["note.example.net", "example.co.jp", "rival.example.com"]);
  });

  it("未分類は件数の多い順に並ぶ", () => {
    const { unclassified } = judgeAnswer("", citations, []);
    expect(unclassified[0].count).toBe(2);
  });
});
