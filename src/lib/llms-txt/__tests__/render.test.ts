import { describe, expect, it } from "vitest";
import { AI_BOTS } from "@/lib/page-report/robots";
import {
  escapeDescription,
  escapeLinkTitle,
  escapeUrl,
  fallbackSiteName,
  groupPages,
  renderLlmsTxt,
  renderPageLine,
  renderRobotsBlock,
} from "../render";
import { matchesPath, parsePatterns, shouldInclude, siteNameFrom } from "../scan";
import { moveItem } from "../store";
import type { LlmsPage, LlmsSection, LlmsTxtState } from "../types";

function page(
  overrides: Partial<LlmsPage> & Pick<LlmsPage, "url" | "title">,
  section: LlmsSection = "主要コンテンツ",
): LlmsPage {
  return { id: overrides.url, description: "", section, enabled: true, ...overrides };
}

function state(overrides: Partial<LlmsTxtState> = {}): LlmsTxtState {
  return {
    step: 6,
    allowCrawl: true,
    siteUrl: "https://example.co.jp/",
    siteName: "サンプル工房",
    summary: "中小企業向けにウェブサイトの制作と運用支援を行う会社のサイトです。",
    details: "",
    languages: [],
    includePaths: "",
    excludePaths: "",
    limit: 30,
    companyName: "",
    companySummary: "",
    companyAddress: "",
    companyContact: "",
    companyUrl: "",
    pages: [],
    authors: [],
    rssUrl: "",
    sitemapUrl: "",
    ...overrides,
  };
}

describe("llms.txt の生成", () => {
  it("最小構成は見出しと概要だけになる", () => {
    expect(renderLlmsTxt(state())).toBe(
      "# サンプル工房\n\n> 中小企業向けにウェブサイトの制作と運用支援を行う会社のサイトです。\n",
    );
  });

  it("ページはセクションごとにまとまり、規定の順に並ぶ", () => {
    const text = renderLlmsTxt(
      state({
        pages: [
          page({ url: "https://example.co.jp/feed", title: "RSS" }, "Optional"),
          page({ url: "https://example.co.jp/service", title: "サービス", description: "制作と運用" }),
          page({ url: "https://example.co.jp/company", title: "会社概要" }, "会社情報"),
        ],
      }),
    );
    expect(text).toContain("## 主要コンテンツ\n- [サービス](https://example.co.jp/service): 制作と運用");
    expect(text.indexOf("## 主要コンテンツ")).toBeLessThan(text.indexOf("## 会社情報"));
    expect(text.indexOf("## 会社情報")).toBeLessThan(text.indexOf("## Optional"));
  });

  it("説明が無いリンクはコロンを付けない", () => {
    expect(renderPageLine({ title: "会社概要", url: "https://example.co.jp/company", description: "" })).toBe(
      "- [会社概要](https://example.co.jp/company)",
    );
  });

  it("出力しないページと URL が空のページは除く", () => {
    const grouped = groupPages([
      page({ url: "https://example.co.jp/a", title: "A" }),
      page({ url: "https://example.co.jp/b", title: "B", enabled: false }),
      page({ url: "   ", title: "C" }),
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].pages).toHaveLength(1);
  });

  it("空のセクションは見出しごと出さない", () => {
    const text = renderLlmsTxt(state({ pages: [] }));
    expect(text).not.toContain("##");
  });

  it("補足段落と言語を出力する", () => {
    const text = renderLlmsTxt(state({ details: "中小企業の担当者向けです。", languages: ["日本語", "English"] }));
    expect(text).toContain("中小企業の担当者向けです。");
    expect(text).toContain("対応言語: 日本語, English");
  });

  it("会社情報は見出し付きで出す。ページ側に同じセクションがあれば見出しを重ねない", () => {
    const withHeading = renderLlmsTxt(
      state({ companyName: "株式会社サンプル工房", companyUrl: "https://example.co.jp/company", companyAddress: "東京都千代田区" }),
    );
    expect(withHeading).toContain("## 会社情報\n- [株式会社サンプル工房](https://example.co.jp/company)");
    expect(withHeading).toContain("- 所在地: 東京都千代田区");

    const merged = renderLlmsTxt(
      state({
        companyName: "株式会社サンプル工房",
        pages: [page({ url: "https://example.co.jp/company", title: "会社概要" }, "会社情報")],
      }),
    );
    expect(merged.match(/## 会社情報/g)).toHaveLength(1);
  });

  it("執筆者・RSS・サイトマップは Optional にまとまる", () => {
    const text = renderLlmsTxt(
      state({
        authors: [{ id: "1", name: "山田 太郎", url: "https://example.co.jp/author/yamada", description: "編集長" }],
        rssUrl: "https://example.co.jp/feed.xml",
        sitemapUrl: "https://example.co.jp/sitemap.xml",
      }),
    );
    expect(text).toContain("## Optional");
    expect(text).toContain("- [山田 太郎](https://example.co.jp/author/yamada): 編集長");
    expect(text).toContain("- [RSS](https://example.co.jp/feed.xml): 更新情報");
    expect(text).toContain("- [サイトマップ](https://example.co.jp/sitemap.xml): 全ページの一覧");
  });

  it("名前だけの執筆者はリンクにしない", () => {
    const text = renderLlmsTxt(state({ authors: [{ id: "1", name: "山田", url: "", description: "" }] }));
    expect(text).toContain("- 山田");
    expect(text).not.toContain("- [山田]");
  });

  it("サイト名が空ならホスト名を使う（www は落とす）", () => {
    expect(fallbackSiteName({ siteName: "", siteUrl: "https://www.example.co.jp/" })).toBe("example.co.jp");
    expect(fallbackSiteName({ siteName: "", siteUrl: "こわれたURL" })).toBe("サイト名");
  });

  it("末尾は改行 1 つで終わる", () => {
    const text = renderLlmsTxt(state());
    expect(text.endsWith("\n")).toBe(true);
    expect(text.endsWith("\n\n")).toBe(false);
  });
});

describe("エスケープ", () => {
  it("タイトルの角括弧を落とし、改行を空白にする", () => {
    expect(escapeLinkTitle("記事 [PR]\nの タイトル")).toBe("記事 PR の タイトル");
  });

  it("説明は 1 行に畳む", () => {
    expect(escapeDescription("1 行目\n2 行目\t3 行目")).toBe("1 行目 2 行目 3 行目");
  });

  it("空白を含む URL はエンコードする", () => {
    expect(escapeUrl("https://example.co.jp/a b")).toBe("https://example.co.jp/a%20b");
    expect(escapeUrl(" https://example.co.jp/a ")).toBe("https://example.co.jp/a");
  });

  it("角括弧を含むタイトルでもリンク記法が壊れない", () => {
    const line = renderPageLine({ title: "[速報] 更新", url: "https://example.co.jp/news", description: "お知らせ" });
    expect(line).toBe("- [速報 更新](https://example.co.jp/news): お知らせ");
  });
});

describe("robots.txt の生成（クロールを許可しない場合）", () => {
  const text = renderRobotsBlock();

  it("すべての AI クローラを列挙する", () => {
    for (const bot of AI_BOTS) {
      expect(text).toContain(`User-agent: ${bot.ua}`);
    }
  });

  it("用途ごとにコメントで区切り、注意書きを付ける", () => {
    expect(text).toContain("# 学習用");
    expect(text).toContain("# 検索用");
    expect(text).toContain("Disallow: /");
    expect(text).toContain("検索用クローラまで拒否すると");
  });
});

describe("パスの絞り込み", () => {
  it("改行・カンマ区切りをパターンにする", () => {
    expect(parsePatterns("/blog\n/news, /faq\n\n")).toEqual(["/blog", "/news", "/faq"]);
    expect(parsePatterns("")).toEqual([]);
  });

  it("前方一致で判定する（先頭のスラッシュは補う）", () => {
    expect(matchesPath("/blog/post-1", "/blog")).toBe(true);
    expect(matchesPath("/blog", "/blog")).toBe(true);
    expect(matchesPath("/blogger", "/blog")).toBe(false);
    expect(matchesPath("/blog/post-1", "blog")).toBe(true);
  });

  it("ワイルドカードを扱う", () => {
    expect(matchesPath("/news/2026/01", "/news/*")).toBe(true);
    expect(matchesPath("/news", "/news/*")).toBe(false);
    expect(matchesPath("/a.b/c", "/a.b/*")).toBe(true);
  });

  it("除外は対象より優先される", () => {
    expect(shouldInclude("https://x.test/blog/a", ["/blog"], ["/blog/a"])).toBe(false);
    expect(shouldInclude("https://x.test/blog/b", ["/blog"], ["/blog/a"])).toBe(true);
    expect(shouldInclude("https://x.test/other", ["/blog"], [])).toBe(false);
    // 対象パスが空なら全部通す
    expect(shouldInclude("https://x.test/other", [], [])).toBe(true);
  });

  it("トップページの title からサイト名を推測する（区切り文字の前を採る）", () => {
    expect(siteNameFrom("サンプル工房｜中小企業のウェブサイト制作", "https://example.co.jp")).toBe("サンプル工房");
    expect(siteNameFrom("サンプル工房 - 制作と運用", "https://example.co.jp")).toBe("サンプル工房");
    expect(siteNameFrom("サンプル工房", "https://example.co.jp")).toBe("サンプル工房");
    expect(siteNameFrom("", "https://www.example.co.jp")).toBe("example.co.jp");
    // 名前とは思えない長さなら推測しない
    expect(siteNameFrom("あ".repeat(40), "https://www.example.co.jp")).toBe("example.co.jp");
  });
});

describe("並べ替え", () => {
  it("要素を 1 つ動かす", () => {
    expect(moveItem(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("範囲外なら元の並びのまま", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 5)).toEqual(["a", "b"]);
  });
});
