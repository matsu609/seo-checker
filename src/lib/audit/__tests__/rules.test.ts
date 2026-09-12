import { describe, expect, it } from "vitest";
import { AUDIT_THRESHOLDS } from "../config";
import {
  ruleBrokenInternalLinks,
  ruleCanonicalBroken,
  ruleCanonicalConflict,
  ruleCanonicalMissing,
  ruleCompression,
  ruleContentRatio,
  ruleContentThin,
  ruleDepth,
  ruleDeprecatedTag,
  ruleFavicon,
  ruleH1,
  ruleHeadingSkip,
  ruleHttpPage,
  ruleIframe,
  ruleImageAlt,
  ruleImageTitle,
  ruleLang,
  ruleMetaDescription,
  ruleMetaRefresh,
  ruleMixedContent,
  ruleNoindex,
  rulePageSize,
  ruleRedirect,
  ruleRobotsBlocked,
  ruleSlowLoad,
  ruleSlowTtfb,
  ruleStatus,
  ruleStructuredData,
  ruleTitle,
  ruleUrlShape,
  ruleViewport,
  runPageRules,
} from "../rules";
import { AUDIT_CATEGORIES } from "../types";
import { ORIGIN, html, japaneseText, makeContext, pageFrom, probe, ruleIds } from "./fixtures";

const T = AUDIT_THRESHOLDS;
const ctx = makeContext();

/** 本文・見出し・画像がそろった「問題のないページ」 */
function goodBody(): string {
  return `<main><article><h1>制作プランのご案内</h1><h2>プランの内容</h2><p>${japaneseText(700)}</p><h3>納期</h3><p>${japaneseText(500)}</p><img src="/a.png" alt="打ち合わせの様子" title="打ち合わせ"></article></main>`;
}

function goodHead(): string {
  return `<title>${"あ".repeat(20)}</title><meta name="description" content="${"あ".repeat(70)}"><link rel="canonical" href="${ORIGIN}/page"><link rel="icon" href="/favicon.ico">`;
}

describe("タイトルタグ", () => {
  it("title が無ければ TITLE_MISSING", () => {
    const page = pageFrom(html({ head: "", body: goodBody() }));
    expect(ruleIds(ruleTitle(page, ctx))).toEqual(["TITLE_MISSING"]);
  });

  it("空の title も TITLE_MISSING として扱う", () => {
    const page = pageFrom(html({ head: "<title>   </title>", body: goodBody() }));
    expect(ruleIds(ruleTitle(page, ctx))).toEqual(["TITLE_MISSING"]);
  });

  it(`全角 ${T.titleMinWidth} 文字ちょうどは短すぎない`, () => {
    const page = pageFrom(html({ head: `<title>${"あ".repeat(T.titleMinWidth)}</title>` }));
    expect(ruleTitle(page, ctx)).toEqual([]);
  });

  it(`全角 ${T.titleMinWidth - 1} 文字は TITLE_SHORT`, () => {
    const page = pageFrom(html({ head: `<title>${"あ".repeat(T.titleMinWidth - 1)}</title>` }));
    expect(ruleIds(ruleTitle(page, ctx))).toEqual(["TITLE_SHORT"]);
  });

  it(`全角 ${T.titleMaxWidth} 文字ちょうどは長すぎない`, () => {
    const page = pageFrom(html({ head: `<title>${"あ".repeat(T.titleMaxWidth)}</title>` }));
    expect(ruleTitle(page, ctx)).toEqual([]);
  });

  it(`全角 ${T.titleMaxWidth + 1} 文字は TITLE_LONG`, () => {
    const page = pageFrom(html({ head: `<title>${"あ".repeat(T.titleMaxWidth + 1)}</title>` }));
    expect(ruleIds(ruleTitle(page, ctx))).toEqual(["TITLE_LONG"]);
  });

  it("半角は 2 文字で全角 1 文字ぶんとして数える", () => {
    // 半角 20 文字 = 全角換算 10 文字 = 下限ちょうど
    const page = pageFrom(html({ head: `<title>${"a".repeat(T.titleMinWidth * 2)}</title>` }));
    expect(ruleTitle(page, ctx)).toEqual([]);
  });
});

describe("メタタグ", () => {
  it("description が無ければ META_DESC_MISSING", () => {
    const page = pageFrom(html({ head: "<title>ページ</title>" }));
    expect(ruleIds(ruleMetaDescription(page, ctx))).toEqual(["META_DESC_MISSING"]);
  });

  it(`全角 ${T.descMinWidth} 文字ちょうどは短すぎない`, () => {
    const page = pageFrom(html({ head: `<meta name="description" content="${"あ".repeat(T.descMinWidth)}">` }));
    expect(ruleMetaDescription(page, ctx)).toEqual([]);
  });

  it(`全角 ${T.descMinWidth - 1} 文字は META_DESC_SHORT`, () => {
    const page = pageFrom(html({ head: `<meta name="description" content="${"あ".repeat(T.descMinWidth - 1)}">` }));
    expect(ruleIds(ruleMetaDescription(page, ctx))).toEqual(["META_DESC_SHORT"]);
  });

  it(`全角 ${T.descMaxWidth} 文字ちょうどは長すぎない`, () => {
    const page = pageFrom(html({ head: `<meta name="description" content="${"あ".repeat(T.descMaxWidth)}">` }));
    expect(ruleMetaDescription(page, ctx)).toEqual([]);
  });

  it(`全角 ${T.descMaxWidth + 1} 文字は META_DESC_LONG`, () => {
    const page = pageFrom(html({ head: `<meta name="description" content="${"あ".repeat(T.descMaxWidth + 1)}">` }));
    expect(ruleIds(ruleMetaDescription(page, ctx))).toEqual(["META_DESC_LONG"]);
  });
});

describe("基本的な設定", () => {
  it("meta refresh を検出する", () => {
    const page = pageFrom(html({ head: '<meta http-equiv="refresh" content="0;url=/new">' }));
    expect(ruleIds(ruleMetaRefresh(page, ctx))).toEqual(["META_REFRESH"]);
    expect(ruleMetaRefresh(pageFrom(html({})), ctx)).toEqual([]);
  });

  it("viewport が無ければ VIEWPORT_MISSING", () => {
    const withViewport = pageFrom(html({}));
    expect(ruleViewport(withViewport, ctx)).toEqual([]);
    const without = pageFrom('<!doctype html><html lang="ja"><head><title>x</title></head><body></body></html>');
    expect(ruleIds(ruleViewport(without, ctx))).toEqual(["VIEWPORT_MISSING"]);
  });

  it("html lang が無ければ LANG_MISSING", () => {
    expect(ruleLang(pageFrom(html({})), ctx)).toEqual([]);
    expect(ruleIds(ruleLang(pageFrom(html({ lang: null })), ctx))).toEqual(["LANG_MISSING"]);
  });

  it("favicon はページの link かサイトの /favicon.ico のどちらかがあればよい", () => {
    const noLink = pageFrom(html({}));
    expect(ruleFavicon(noLink, makeContext({ faviconExists: true }))).toEqual([]);
    expect(ruleIds(ruleFavicon(noLink, makeContext({ faviconExists: false })))).toEqual(["FAVICON_MISSING"]);
    const withLink = pageFrom(html({ head: '<link rel="icon" href="/favicon.ico">' }));
    expect(ruleFavicon(withLink, makeContext({ faviconExists: false }))).toEqual([]);
  });

  it("URL に大文字が含まれると URL_UPPERCASE", () => {
    const page = pageFrom(html({}), { url: `${ORIGIN}/News/Index` });
    expect(ruleIds(ruleUrlShape(page, ctx))).toContain("URL_UPPERCASE");
  });

  it(`URL が ${T.maxUrlLength} 文字を超えると URL_BAD`, () => {
    const long = `${ORIGIN}/${"a".repeat(T.maxUrlLength)}`;
    expect(long.length).toBeGreaterThan(T.maxUrlLength);
    expect(ruleIds(ruleUrlShape(pageFrom(html({}), { url: long }), ctx))).toContain("URL_BAD");
    const ok = `${ORIGIN}/news`;
    expect(ruleUrlShape(pageFrom(html({}), { url: ok }), ctx)).toEqual([]);
  });

  it("アンダースコアと多段クエリを URL_BAD として拾う", () => {
    const page = pageFrom(html({}), { url: `${ORIGIN}/news_list?a=1&b=2&c=3` });
    expect(ruleIds(ruleUrlShape(page, ctx))).toEqual(["URL_BAD"]);
  });

  it("4XX / 5XX をステータスから判定する", () => {
    expect(ruleIds(ruleStatus(pageFrom(html({}), { status: 404 }), ctx))).toEqual(["STATUS_4XX"]);
    expect(ruleIds(ruleStatus(pageFrom(html({}), { status: 503 }), ctx))).toEqual(["STATUS_5XX"]);
    expect(ruleStatus(pageFrom(html({})), ctx)).toEqual([]);
  });

  it("リダイレクトは REDIRECT_3XX、2 ホップなら REDIRECT_CHAIN も出す", () => {
    const page = pageFrom(html({}), { url: `${ORIGIN}/old`, finalUrl: `${ORIGIN}/new` });
    expect(ruleIds(ruleRedirect(page, ctx))).toEqual(["REDIRECT_3XX"]);
    const chained = makeContext({ probes: { [`${ORIGIN}/old`]: probe(200, `${ORIGIN}/new`, 2) } });
    expect(ruleIds(ruleRedirect(page, chained))).toEqual(["REDIRECT_3XX", "REDIRECT_CHAIN"]);
  });

  it("meta robots / X-Robots-Tag の noindex を拾う", () => {
    const meta = pageFrom(html({ head: '<meta name="robots" content="noindex, follow">' }));
    expect(ruleIds(ruleNoindex(meta, ctx))).toEqual(["NOINDEX"]);
    expect(ruleNoindex(meta, ctx)[0].severity).toBe("warning");
    const header = pageFrom(html({}), { headers: { "x-robots-tag": "noindex" } });
    expect(ruleIds(ruleNoindex(header, ctx))).toEqual(["NOINDEX"]);
    expect(ruleNoindex(pageFrom(html({})), ctx)).toEqual([]);
  });

  // サイト内検索の結果ページなどの noindex は正しい設定。事実は残すが警告にはしない
  it("もともと検索に載せないページの noindex は警告にしない", () => {
    const search = pageFrom(html({ head: '<meta name="robots" content="noindex">' }), {
      url: `${ORIGIN}/search?q=seo`,
    });
    const [found] = ruleNoindex(search, ctx);
    expect(found.severity).toBe("info");
    expect(found.detail).toContain("サイト内検索の結果ページ");
    expect(found.suggestion).toContain("対応は不要");
  });

  it("robots.txt で拒否されていれば ROBOTS_BLOCKED", () => {
    const blocked = pageFrom(html({}), { robotsAllowed: false });
    expect(ruleIds(ruleRobotsBlocked(blocked, ctx))).toEqual(["ROBOTS_BLOCKED"]);
    expect(ruleRobotsBlocked(pageFrom(html({})), ctx)).toEqual([]);
  });
});

describe("見出しタグ", () => {
  it("h1 が無ければ H1_MISSING、2 つ以上なら H1_MULTIPLE", () => {
    expect(ruleIds(ruleH1(pageFrom(html({ body: "<h2>見出し</h2>" })), ctx))).toEqual(["H1_MISSING"]);
    expect(ruleIds(ruleH1(pageFrom(html({ body: "<h1>A</h1><h1>B</h1>" })), ctx))).toEqual(["H1_MULTIPLE"]);
    expect(ruleH1(pageFrom(html({ body: "<h1>A</h1>" })), ctx)).toEqual([]);
  });

  it("h2 の次に h4 が来ると HEADING_SKIP", () => {
    const skipped = pageFrom(html({ body: "<h1>A</h1><h2>B</h2><h4>C</h4>" }));
    expect(ruleIds(ruleHeadingSkip(skipped, ctx))).toEqual(["HEADING_SKIP"]);
    const ok = pageFrom(html({ body: "<h1>A</h1><h2>B</h2><h3>C</h3>" }));
    expect(ruleHeadingSkip(ok, ctx)).toEqual([]);
  });
});

describe("コンテンツ", () => {
  it(`本文 ${T.thinContentChars} 文字ちょうどは薄いと判定しない`, () => {
    const page = pageFrom(html({ body: `<main><h1>見出し</h1><p>${japaneseText(T.thinContentChars)}</p></main>` }));
    expect(page.mainTextLength).toBeGreaterThanOrEqual(T.thinContentChars);
    expect(ruleContentThin(page, ctx)).toEqual([]);
  });

  it("本文が閾値未満なら CONTENT_THIN", () => {
    const page = pageFrom(html({ body: "<main><h1>臨時休業のお知らせ</h1><p>本日は社内研修のため休業します</p></main>" }));
    expect(page.mainTextLength).toBeLessThan(T.thinContentChars);
    expect(ruleIds(ruleContentThin(page, ctx))).toEqual(["CONTENT_THIN"]);
  });

  it("テキストと HTML の比が低いと CONTENT_LOW_RATIO", () => {
    const noise = `<script>${"x".repeat(40000)}</script>`;
    const page = pageFrom(html({ body: `<main><h1>見出し</h1><p>${japaneseText(400)}</p>${noise}</main>` }));
    expect(page.textRatio).toBeLessThan(T.lowTextRatio);
    expect(ruleIds(ruleContentRatio(page, ctx))).toEqual(["CONTENT_LOW_RATIO"]);
  });

  it("普通のページは CONTENT_LOW_RATIO を出さない", () => {
    const page = pageFrom(html({ body: `<main><h1>見出し</h1><p>${japaneseText(2000)}</p></main>` }));
    expect(ruleContentRatio(page, ctx)).toEqual([]);
  });
});

describe("画像", () => {
  it("alt 属性の無い画像を数える（alt=\"\" は装飾扱いで対象外）", () => {
    const page = pageFrom(html({ body: '<img src="/a.png"><img src="/b.png" alt=""><img src="/c.png" alt="説明">' }));
    expect(page.imagesWithoutAlt).toBe(1);
    expect(ruleIds(ruleImageAlt(page, ctx))).toEqual(["IMG_ALT_MISSING"]);
  });

  it("すべてに alt があれば何も出さない", () => {
    const page = pageFrom(html({ body: '<img src="/a.png" alt="説明">' }));
    expect(ruleImageAlt(page, ctx)).toEqual([]);
  });

  it("title の無い画像は情報として出す。画像が無ければ何も出さない", () => {
    const page = pageFrom(html({ body: '<img src="/a.png" alt="説明">' }));
    expect(ruleIds(ruleImageTitle(page, ctx))).toEqual(["IMG_TITLE_MISSING"]);
    expect(ruleImageTitle(pageFrom(html({ body: "<p>画像なし</p>" })), ctx)).toEqual([]);
  });
});

describe("カノニカルタグ", () => {
  it("canonical が無ければ CANONICAL_MISSING", () => {
    expect(ruleIds(ruleCanonicalMissing(pageFrom(html({})), ctx))).toEqual(["CANONICAL_MISSING"]);
    const withCanonical = pageFrom(html({ head: `<link rel="canonical" href="${ORIGIN}/page">` }));
    expect(ruleCanonicalMissing(withCanonical, ctx)).toEqual([]);
  });

  it("canonical の先が 404 なら CANONICAL_BROKEN", () => {
    const page = pageFrom(html({ head: `<link rel="canonical" href="${ORIGIN}/gone">` }));
    const context = makeContext({ probes: { [`${ORIGIN}/gone`]: probe(404, `${ORIGIN}/gone`) } });
    expect(ruleIds(ruleCanonicalBroken(page, context))).toEqual(["CANONICAL_BROKEN"]);
    expect(ruleCanonicalBroken(page, ctx)).toEqual([]);
  });

  it("canonical が 2 つあると CANONICAL_CONFLICT", () => {
    const page = pageFrom(
      html({ head: `<link rel="canonical" href="${ORIGIN}/a"><link rel="canonical" href="${ORIGIN}/b">` }),
    );
    expect(ruleIds(ruleCanonicalConflict(page, ctx))).toEqual(["CANONICAL_CONFLICT"]);
  });

  it("canonical と og:url が食い違うと CANONICAL_CONFLICT", () => {
    const page = pageFrom(
      html({
        head: `<link rel="canonical" href="${ORIGIN}/a"><meta property="og:url" content="${ORIGIN}/b">`,
      }),
    );
    expect(ruleIds(ruleCanonicalConflict(page, ctx))).toEqual(["CANONICAL_CONFLICT"]);
  });

  it("canonical と og:url が一致すれば問題にしない（末尾スラッシュの差は無視）", () => {
    const page = pageFrom(
      html({
        head: `<link rel="canonical" href="${ORIGIN}/a"><meta property="og:url" content="${ORIGIN}/a/">`,
      }),
    );
    expect(ruleCanonicalConflict(page, ctx)).toEqual([]);
  });
});

describe("セキュリティ", () => {
  it("http で配信されていれば HTTP_PAGE", () => {
    const page = pageFrom(html({}), { url: "http://example.test/a", finalUrl: "http://example.test/a" });
    expect(ruleIds(ruleHttpPage(page, ctx))).toEqual(["HTTP_PAGE"]);
    expect(ruleHttpPage(pageFrom(html({})), ctx)).toEqual([]);
  });

  it("https のページに http のリソースがあれば MIXED_CONTENT", () => {
    const page = pageFrom(html({ body: '<img src="http://cdn.example.com/a.png" alt="a">' }));
    expect(page.mixedContent).toHaveLength(1);
    expect(ruleIds(ruleMixedContent(page, ctx))).toEqual(["MIXED_CONTENT"]);
  });

  it("http のリンク（a href）は mixed content にしない", () => {
    const page = pageFrom(html({ body: '<a href="http://example.com/x">外部</a>' }));
    expect(page.mixedContent).toEqual([]);
  });
});

describe("パフォーマンス", () => {
  it(`${T.compressionMinBytes} バイト未満なら圧縮を問わない`, () => {
    const page = pageFrom(html({ body: "<p>短い</p>" }));
    expect(page.bytes).toBeLessThan(T.compressionMinBytes);
    expect(ruleCompression(page, ctx)).toEqual([]);
  });

  it("大きいのに Content-Encoding が無ければ NOT_COMPRESSED", () => {
    const big = pageFrom(html({ body: `<p>${japaneseText(20000)}</p>` }));
    expect(big.bytes).toBeGreaterThan(T.compressionMinBytes);
    expect(ruleIds(ruleCompression(big, ctx))).toEqual(["NOT_COMPRESSED"]);
    const gzipped = pageFrom(html({ body: `<p>${japaneseText(20000)}</p>` }), {
      headers: { "content-encoding": "gzip" },
    });
    expect(ruleCompression(gzipped, ctx)).toEqual([]);
  });

  it("Content-Length を優先してサイズを判定する", () => {
    const page = pageFrom(html({ body: "<p>短い</p>" }), {
      headers: { "content-length": String(T.maxPageBytes + 1) },
    });
    expect(ruleIds(rulePageSize(page, ctx))).toEqual(["PAGE_TOO_LARGE"]);
    const ok = pageFrom(html({ body: "<p>短い</p>" }), {
      headers: { "content-length": String(T.maxPageBytes) },
    });
    expect(rulePageSize(ok, ctx)).toEqual([]);
  });

  it("取得時間の閾値をまたぐと SLOW_TTFB / SLOW_LOAD", () => {
    expect(ruleSlowTtfb(pageFrom(html({}), { loadMs: T.slowTtfbMs }), ctx)).toEqual([]);
    expect(ruleIds(ruleSlowTtfb(pageFrom(html({}), { loadMs: T.slowTtfbMs + 1 }), ctx))).toEqual(["SLOW_TTFB"]);
    expect(ruleSlowLoad(pageFrom(html({}), { loadMs: T.slowLoadMs }), ctx)).toEqual([]);
    expect(ruleIds(ruleSlowLoad(pageFrom(html({}), { loadMs: T.slowLoadMs + 1 }), ctx))).toEqual(["SLOW_LOAD"]);
  });

  it("計測していないページ（loadMs が null）では速度のルールを出さない", () => {
    const page = pageFrom(html({}), { loadMs: null });
    expect(ruleSlowTtfb(page, ctx)).toEqual([]);
    expect(ruleSlowLoad(page, ctx)).toEqual([]);
  });
});

describe("構造", () => {
  it("iframe と廃止タグを検出する", () => {
    const page = pageFrom(html({ body: '<iframe src="/x"></iframe><center><font>古い</font></center>' }));
    expect(ruleIds(ruleIframe(page, ctx))).toEqual(["IFRAME_PRESENT"]);
    expect(ruleIds(ruleDeprecatedTag(page, ctx))).toEqual(["DEPRECATED_TAG"]);
    expect(page.deprecatedTags).toEqual(expect.arrayContaining(["font", "center"]));
  });

  it("壊れた JSON-LD は STRUCTURED_DATA_INVALID", () => {
    const broken = pageFrom(
      html({ head: '<script type="application/ld+json">{"@type": "Article",}</script>' }),
    );
    expect(ruleIds(ruleStructuredData(broken, ctx))).toEqual(["STRUCTURED_DATA_INVALID"]);
  });

  it("@type の無い JSON-LD も STRUCTURED_DATA_INVALID", () => {
    const noType = pageFrom(html({ head: '<script type="application/ld+json">{"name": "会社"}</script>' }));
    expect(ruleIds(ruleStructuredData(noType, ctx))).toEqual(["STRUCTURED_DATA_INVALID"]);
  });

  it("正しい JSON-LD は何も出さない。JSON-LD が無いページも対象外", () => {
    const ok = pageFrom(
      html({ head: '<script type="application/ld+json">{"@type": "Organization", "name": "会社"}</script>' }),
    );
    expect(ruleStructuredData(ok, ctx)).toEqual([]);
    expect(ruleStructuredData(pageFrom(html({})), ctx)).toEqual([]);
  });

  it("リンク先が 404 なら LINK_BROKEN_INTERNAL", () => {
    const page = pageFrom(html({ body: `<a href="${ORIGIN}/gone">古い記事</a>` }));
    const context = makeContext({ probes: { [`${ORIGIN}/gone`]: probe(404, `${ORIGIN}/gone`) } });
    expect(ruleIds(ruleBrokenInternalLinks(page, context))).toEqual(["LINK_BROKEN_INTERNAL"]);
    expect(ruleBrokenInternalLinks(page, ctx)).toEqual([]);
  });

  it(`階層が ${T.maxDepth} を超えると DEPTH_TOO_DEEP`, () => {
    const page = pageFrom(html({}));
    page.depth = T.maxDepth;
    expect(ruleDepth(page, ctx)).toEqual([]);
    page.depth = T.maxDepth + 1;
    expect(ruleIds(ruleDepth(page, ctx))).toEqual(["DEPTH_TOO_DEEP"]);
    page.depth = null;
    expect(ruleDepth(page, ctx)).toEqual([]);
  });
});

describe("全ルールの適用", () => {
  it("問題のないページでは課題が出ない", () => {
    const page = pageFrom(html({ head: goodHead(), body: goodBody() }), { url: `${ORIGIN}/page` });
    page.depth = 1;
    expect(runPageRules(page, ctx)).toEqual([]);
  });

  it("課題のカテゴリは定義済みの 10 種に収まる", () => {
    const page = pageFrom(html({ body: "<p>短い</p>" }), { url: `${ORIGIN}/A_b?x=1&y=2&z=3` });
    const issues = runPageRules(page, makeContext({ faviconExists: false }));
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      expect(AUDIT_CATEGORIES).toContain(issue.category);
      expect(issue.suggestion.length).toBeGreaterThan(0);
      expect(issue.detail.length).toBeGreaterThan(0);
    }
  });
});
