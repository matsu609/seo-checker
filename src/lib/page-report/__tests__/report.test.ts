import { describe, expect, it } from "vitest";
import type { FetchedText } from "@/lib/analyzer/fetch";
import type { SiteFiles } from "@/lib/analyzer/robots";
import { buildPageReport } from "../analyze";
import { PAGE_REPORT_THRESHOLDS, SECTION_IDS, SECTION_WEIGHTS, STATUS_RATIO, scoreBandLabel } from "../config";
import { bigramOverlap, extractJsonLdNodes, splitSentences } from "../extract";
import { evaluateAiBots, AI_BOTS } from "../robots";
import { buildSection, statusFrom, totalScore } from "../score";
import type { SectionId } from "../config";
import type { PageReport, ReportRow } from "../types";
import * as cheerio from "cheerio";

const T = PAGE_REPORT_THRESHOLDS;
const URL_UNDER_TEST = "https://example.test/service/";

function siteFiles(overrides: Partial<SiteFiles> = {}): SiteFiles {
  return {
    origin: "https://example.test",
    robotsTxt: "User-agent: *\nAllow: /\n",
    sitemaps: [],
    llmsTxt: { present: true, length: 420, status: 200 },
    llmsFullTxt: { present: false, length: 0 },
    ...overrides,
  };
}

function fetched(
  body: string,
  headers: Record<string, string> = {},
  finalUrl: string = URL_UNDER_TEST,
): FetchedText {
  return {
    ok: true,
    status: 200,
    finalUrl,
    contentType: "text/html; charset=utf-8",
    body,
    headers: new Headers({ "content-type": "text/html; charset=utf-8", ...headers }),
  };
}

function japanese(chars: number): string {
  const sentence = "当社は中小企業のウェブサイト制作と運用支援を行う会社です。";
  return sentence.repeat(Math.ceil(chars / sentence.length)).slice(0, chars);
}

/** 全項目が「適切」になるよう作った理想的なページ */
function idealHtml(): string {
  const paragraphs = [0, 1, 2, 3].map((i) => `<h2>見出し${i}</h2><p>${japanese(500)}</p>`).join("");
  return `<!doctype html><html lang="ja"><head>
<meta charset="utf-8">
<title>${"あ".repeat(20)}サービス</title>
<meta name="description" content="${"あ".repeat(70)}">
<link rel="canonical" href="${URL_UNDER_TEST}">
<meta property="og:title" content="サービス"><meta property="og:description" content="説明"><meta property="og:image" content="/ogp.png">
<meta property="article:published_time" content="2026-01-01">
<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Organization", name: "サンプル", url: "https://example.test/" },
      { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1 }] },
    ],
  })}</script>
</head><body>
<header><nav><a href="/">ホーム</a></nav></header>
<main><article>
<h1>${"あ".repeat(20)}サービス</h1>
${paragraphs}
<p><a href="/service/a">制作プランの詳細を見る</a>／<a href="/service/b">運用プランの詳細を見る</a>／<a href="/company">会社概要を見る</a>
<a href="/blog">ブログの一覧を見る</a><a href="/news">お知らせの一覧を見る</a><a href="/recruit">採用情報を見る</a>
<a href="/contact">お問い合わせ</a><a href="/faq">よくある質問</a><a href="/case">導入事例</a><a href="/price">料金表</a></p>
<img src="/a.png" alt="制作チームが打ち合わせをしている様子">
<img src="/b.png" alt="問い合わせ件数の推移を示すグラフ">
</article></main>
<footer><p>フッター</p></footer>
</body></html>`;
}

function rowOf(report: PageReport, section: SectionId, item: string): ReportRow {
  const row = report.sections.find((s) => s.id === section)?.rows.find((r) => r.item === item);
  if (!row) throw new Error(`row not found: ${section} / ${item}`);
  return row;
}

describe("配点", () => {
  it("セクションの重みの合計は 100", () => {
    expect(Object.values(SECTION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("すべてのセクション ID に重み・ラベルがある", () => {
    for (const id of SECTION_IDS) {
      expect(SECTION_WEIGHTS[id]).toBeGreaterThan(0);
    }
  });

  it("ステータスの換算率は 適切 > 良好 > 要改善", () => {
    expect(STATUS_RATIO.適切).toBeGreaterThan(STATUS_RATIO.良好);
    expect(STATUS_RATIO.良好).toBeGreaterThan(STATUS_RATIO.要改善);
  });

  it("全項目が適切なら満点、全項目が要改善なら 0 点", () => {
    const rows = (status: ReportRow["status"]): ReportRow[] =>
      [1, 2].map((i) => ({ item: `項目${i}`, status, content: "", note: "" }));
    const all = SECTION_IDS.map((id) => buildSection(id, rows("適切")));
    expect(totalScore(all)).toBe(100);
    const none = SECTION_IDS.map((id) => buildSection(id, rows("要改善")));
    expect(totalScore(none)).toBe(0);
  });

  it("セクションの得点は 重み × 平均換算率", () => {
    const section = buildSection("content", [
      { item: "a", status: "適切", content: "", note: "" },
      { item: "b", status: "要改善", content: "", note: "" },
    ]);
    expect(section.ratio).toBe(0.5);
    expect(section.points).toBe(10); // 20 点 × 0.5
  });

  it("バッジは 80 / 60 で切り替わる", () => {
    expect(scoreBandLabel(80)).toBe("良好");
    expect(scoreBandLabel(79)).toBe("改善余地あり");
    expect(scoreBandLabel(60)).toBe("改善余地あり");
    expect(scoreBandLabel(59)).toBe("要改善");
  });

  it("statusFrom は上限・下限の向きを扱える", () => {
    expect(statusFrom(10, 10, 5)).toBe("適切");
    expect(statusFrom(7, 10, 5)).toBe("良好");
    expect(statusFrom(4, 10, 5)).toBe("要改善");
    // 小さいほど良い指標
    expect(statusFrom(0.2, 0.3, 0.6, false)).toBe("適切");
    expect(statusFrom(0.5, 0.3, 0.6, false)).toBe("良好");
    expect(statusFrom(0.9, 0.3, 0.6, false)).toBe("要改善");
  });
});

describe("理想的なページ", () => {
  const report = buildPageReport(fetched(idealHtml()), siteFiles(), { requestedUrl: URL_UNDER_TEST });

  it("高得点になり、要改善の項目が出ない", () => {
    const poor = report.sections.flatMap((s) => s.rows.filter((r) => r.status === "要改善"));
    expect(poor.map((r) => r.item)).toEqual([]);
    expect(report.score).toBeGreaterThanOrEqual(90);
    expect(report.scoreLabel).toBe("良好");
  });

  it("セクションは 8 つ、合計配点は 100", () => {
    expect(report.sections).toHaveLength(8);
    expect(report.sections.reduce((sum, s) => sum + s.weight, 0)).toBe(100);
  });

  it("総評は 3 行で、AI を使っていない", () => {
    expect(report.summary).toHaveLength(3);
    expect(report.summary[0]).toContain(`${report.score} 点`);
  });
});

describe("本文抽出・評価", () => {
  it("文字数の閾値をまたぐと判定が変わる", () => {
    const long = buildPageReport(fetched(idealHtml()), siteFiles());
    expect(rowOf(long, "content", "文字数ボリューム").status).toBe("適切");

    const short = buildPageReport(
      fetched(`<html lang="ja"><head><title>短い</title></head><body><main><h1>短い</h1><p>${japanese(100)}</p></main></body></html>`),
      siteFiles(),
    );
    expect(rowOf(short, "content", "文字数ボリューム").status).toBe("要改善");
    expect(rowOf(short, "content", "文字数ボリューム").content).toContain("文字");
  });

  it("本文が長い 1 文だけだと読みやすさが下がる", () => {
    const oneLongSentence = `<html lang="ja"><head><title>長文</title></head><body><main><h1>長文</h1><p>${japanese(2000).replace(/。/g, "、")}。</p></main></body></html>`;
    const report = buildPageReport(fetched(oneLongSentence), siteFiles());
    expect(rowOf(report, "content", "文の読みやすさ").status).toBe("要改善");
  });

  it("見出しが無いと見出しの間隔が要改善になる", () => {
    const noHeadings = `<html lang="ja"><head><title>見出しなし</title></head><body><main><p>${japanese(3000)}</p></main></body></html>`;
    const report = buildPageReport(fetched(noHeadings), siteFiles());
    expect(rowOf(report, "content", "見出しの間隔").status).toBe("要改善");
  });

  it("本文が 0 文字のページは測定不能な行を「適切」にしない", () => {
    const report = buildPageReport(fetched('<html lang="ja"><body></body></html>'), siteFiles());
    expect(rowOf(report, "content", "文の読みやすさ").status).toBe("要改善");
    expect(rowOf(report, "content", "文の読みやすさ").note).toContain("評価できません");
    expect(rowOf(report, "content", "見出しの間隔").status).toBe("要改善");
    expect(rowOf(report, "semantic", "div への依存").status).toBe("要改善");
    // 構造化データが無いページを「文法が正しい」と褒めない
    expect(rowOf(report, "structuredData", "文法の正しさ").content).toContain("検証していません");
    expect(report.notes.some((n) => n.includes("本文を 1 文字も抽出できませんでした"))).toBe(true);
    // 本文セクションは 4 行すべて要改善になるので配点は 0
    expect(report.sections.find((s) => s.id === "content")?.ratio).toBe(0);
  });

  it("文の分割は句点と改行で行う", () => {
    expect(splitSentences("一つ目です。二つ目です。三つ目")).toHaveLength(3);
    expect(splitSentences("")).toEqual([]);
  });
});

describe("見出し構造", () => {
  it("h1 が 0 個・2 個のときは要改善", () => {
    const none = buildPageReport(fetched('<html lang="ja"><body><main><h2>見出し</h2></main></body></html>'), siteFiles());
    expect(rowOf(none, "headings", "h1 の数").status).toBe("要改善");
    const two = buildPageReport(
      fetched('<html lang="ja"><body><main><h1>A</h1><h1>B</h1></main></body></html>'),
      siteFiles(),
    );
    expect(rowOf(two, "headings", "h1 の数").status).toBe("要改善");
  });

  it("階層が 1 箇所飛ぶと良好、2 箇所以上で要改善", () => {
    const one = buildPageReport(
      fetched('<html lang="ja"><body><main><h1>A</h1><h2>B</h2><h4>C</h4></main></body></html>'),
      siteFiles(),
    );
    expect(rowOf(one, "headings", "見出しの階層").status).toBe("良好");
    const two = buildPageReport(
      fetched('<html lang="ja"><body><main><h1>A</h1><h2>B</h2><h4>C</h4><h2>D</h2><h5>E</h5></main></body></html>'),
      siteFiles(),
    );
    expect(rowOf(two, "headings", "見出しの階層").status).toBe("要改善");
  });

  it("title と h1 の語の重なりを測る", () => {
    expect(bigramOverlap("制作プランのご案内", "制作プランのご案内")).toBe(1);
    expect(bigramOverlap("制作プラン", "採用情報")).toBe(0);
    expect(bigramOverlap("", "何か")).toBe(0);
  });
});

describe("構造化データ", () => {
  it("必須プロパティの不足を指摘する", () => {
    const html = `<html lang="ja"><head><script type="application/ld+json">${JSON.stringify({
      "@type": "Article",
      headline: "見出しだけある記事",
    })}</script></head><body><main><h1>記事</h1></main></body></html>`;
    const report = buildPageReport(fetched(html), siteFiles());
    const row = rowOf(report, "structuredData", "必須プロパティ");
    expect(row.status).toBe("良好");
    expect(row.content).toContain("author");
    expect(row.content).toContain("datePublished");
  });

  it("必須プロパティがそろえば適切", () => {
    const html = `<html lang="ja"><head><script type="application/ld+json">${JSON.stringify({
      "@type": "Article",
      headline: "記事",
      author: { "@type": "Person", name: "山田" },
      datePublished: "2026-01-01",
    })}</script></head><body><main><h1>記事</h1></main></body></html>`;
    const report = buildPageReport(fetched(html), siteFiles());
    expect(rowOf(report, "structuredData", "必須プロパティ").status).toBe("適切");
  });

  it("壊れた JSON-LD は文法エラーとして出す", () => {
    const html = '<html lang="ja"><head><script type="application/ld+json">{"@type":"Article",}</script></head><body></body></html>';
    const report = buildPageReport(fetched(html), siteFiles());
    expect(rowOf(report, "structuredData", "文法の正しさ").status).toBe("要改善");
    expect(rowOf(report, "structuredData", "JSON-LD の有無").status).toBe("要改善");
  });

  it("@graph の入れ子からも @type を集める", () => {
    const $ = cheerio.load(
      `<script type="application/ld+json">${JSON.stringify({
        "@graph": [{ "@type": "Organization", name: "会社", url: "https://x.test" }, { "@type": "WebSite" }],
      })}</script>`,
    );
    const info = extractJsonLdNodes($);
    expect(info.types.sort()).toEqual(["Organization", "WebSite"]);
    expect(info.nodes.find((n) => n.type === "WebSite")?.missing).toEqual(["name", "url"]);
    expect(info.nodes.find((n) => n.type === "Organization")?.missing).toEqual([]);
  });
});

describe("Head 情報", () => {
  it("title と description は長さで 適切 / 良好 を分ける", () => {
    const short = buildPageReport(
      fetched(`<html lang="ja"><head><title>短</title><meta name="description" content="短い"></head><body></body></html>`),
      siteFiles(),
    );
    expect(rowOf(short, "head", "title").status).toBe("良好");
    expect(rowOf(short, "head", "meta description").status).toBe("良好");

    const missing = buildPageReport(fetched('<html lang="ja"><head></head><body></body></html>'), siteFiles());
    expect(rowOf(missing, "head", "title").status).toBe("要改善");
    expect(rowOf(missing, "head", "meta description").status).toBe("要改善");
  });

  it(`title は全角 ${T.titleMin}〜${T.titleMax} 文字が適切`, () => {
    const ok = buildPageReport(
      fetched(`<html lang="ja"><head><title>${"あ".repeat(T.titleMin)}</title></head><body></body></html>`),
      siteFiles(),
    );
    expect(rowOf(ok, "head", "title").status).toBe("適切");
    const tooLong = buildPageReport(
      fetched(`<html lang="ja"><head><title>${"あ".repeat(T.titleMax + 1)}</title></head><body></body></html>`),
      siteFiles(),
    );
    expect(rowOf(tooLong, "head", "title").status).toBe("良好");
  });

  it("lang が無ければ要改善", () => {
    const report = buildPageReport(fetched("<html><head></head><body></body></html>"), siteFiles());
    expect(rowOf(report, "head", "言語の宣言").status).toBe("要改善");
  });
});

describe("セマンティックタグと内部リンク", () => {
  it("main が無ければ要改善", () => {
    const report = buildPageReport(
      fetched('<html lang="ja"><body><div><h1>見出し</h1></div></body></html>'),
      siteFiles(),
    );
    expect(rowOf(report, "semantic", "main 要素").status).toBe("要改善");
  });

  it("本文内リンクの本数で判定が変わる", () => {
    const none = buildPageReport(
      fetched('<html lang="ja"><body><main><h1>見出し</h1></main></body></html>'),
      siteFiles(),
    );
    expect(rowOf(none, "internalLinks", "本文内のリンク").status).toBe("要改善");
  });

  it("「こちら」ばかりのアンカーは具体性が低いと判定する", () => {
    const vague = `<html lang="ja"><body><main><h1>見出し</h1>
      <a href="/a">こちら</a><a href="/b">詳しくは</a><a href="/c">こちら</a><a href="/d">もっと見る</a>
    </main></body></html>`;
    const report = buildPageReport(fetched(vague), siteFiles());
    expect(rowOf(report, "internalLinks", "アンカーテキストの具体性").status).toBe("要改善");
  });
});

describe("画像 alt", () => {
  it("画像が無いページは減点しない", () => {
    const report = buildPageReport(
      fetched('<html lang="ja"><body><main><h1>見出し</h1></main></body></html>'),
      siteFiles(),
    );
    const section = report.sections.find((s) => s.id === "images");
    expect(section?.rows).toHaveLength(1);
    expect(section?.ratio).toBe(1);
  });

  it("alt 充足率の閾値をまたぐと判定が変わる", () => {
    const half = `<html lang="ja"><body><main><h1>見出し</h1><img src="/a.png" alt="説明文です"><img src="/b.png"></main></body></html>`;
    const report = buildPageReport(fetched(half), siteFiles());
    expect(rowOf(report, "images", "alt 充足率").status).toBe("要改善");
    expect(rowOf(report, "images", "alt 充足率").content).toContain("50%");
  });

  it("短すぎる alt は説明的でないと判定する", () => {
    const shortAlt = `<html lang="ja"><body><main><h1>見出し</h1><img src="/a.png" alt="図"><img src="/b.png" alt="図"></main></body></html>`;
    const report = buildPageReport(fetched(shortAlt), siteFiles());
    expect(rowOf(report, "images", "alt 充足率").status).toBe("適切");
    expect(rowOf(report, "images", "説明的な alt").status).toBe("要改善");
  });
});

describe("robots・llms", () => {
  it("llms.txt が無ければ要改善", () => {
    const report = buildPageReport(
      fetched(idealHtml()),
      siteFiles({ llmsTxt: { present: false, length: 0, status: 404 } }),
    );
    expect(rowOf(report, "robots", "llms.txt").status).toBe("要改善");
  });

  it("noindex があれば要改善", () => {
    const html = '<html lang="ja"><head><meta name="robots" content="noindex"></head><body></body></html>';
    const report = buildPageReport(fetched(html), siteFiles());
    expect(rowOf(report, "robots", "meta robots").status).toBe("要改善");
  });

  // サイト内検索の結果ページの noindex は正しい設定。外させてはいけない
  it("サイト内検索の結果ページの noindex は要改善にしない", () => {
    const html = '<html lang="ja"><head><meta name="robots" content="noindex"></head><body></body></html>';
    const report = buildPageReport(
      fetched(html, {}, "https://example.test/search?q=seo"),
      siteFiles(),
    );
    const row = rowOf(report, "robots", "meta robots");
    expect(row.status).toBe("適切");
    expect(row.content).toContain("サイト内検索の結果ページ");
  });

  it("X-Robots-Tag の noindex も拾う", () => {
    const report = buildPageReport(
      fetched('<html lang="ja"><body></body></html>', { "x-robots-tag": "noindex, nofollow" }),
      siteFiles(),
    );
    expect(report.measurements.noindex).toBe(true);
  });

  it("検索用クローラを全部拒否すると要改善、一部なら良好", () => {
    const all = buildPageReport(
      fetched(idealHtml()),
      siteFiles({ robotsTxt: "User-agent: *\nDisallow: /\n" }),
    );
    expect(rowOf(all, "robots", "検索用 AI クローラの許可").status).toBe("要改善");

    const partial = buildPageReport(
      fetched(idealHtml()),
      siteFiles({ robotsTxt: "User-agent: *\nAllow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n" }),
    );
    expect(rowOf(partial, "robots", "検索用 AI クローラの許可").status).toBe("良好");
  });

  it("学習用の拒否は減点しない（方針としての選択）", () => {
    const report = buildPageReport(
      fetched(idealHtml()),
      siteFiles({ robotsTxt: "User-agent: GPTBot\nDisallow: /\nUser-agent: CCBot\nDisallow: /\n" }),
    );
    expect(rowOf(report, "robots", "学習用 AI クローラの扱い").status).toBe("良好");
  });
});

describe("AI クローラの判定表", () => {
  const robotsUrl = "https://example.test/robots.txt";
  const pageUrl = "https://example.test/service/";

  it("robots.txt が無ければ全部許可、exists は false", () => {
    const matrix = evaluateAiBots(null, pageUrl, robotsUrl);
    expect(matrix.exists).toBe(false);
    expect(matrix.bots).toHaveLength(AI_BOTS.length);
    expect(matrix.bots.every((b) => b.allowed)).toBe(true);
  });

  it("ワイルドカードの Disallow は全ボットに効く", () => {
    const matrix = evaluateAiBots("User-agent: *\nDisallow: /\n", pageUrl, robotsUrl);
    expect(matrix.bots.every((b) => !b.allowed)).toBe(true);
    expect(matrix.blocked.search).toBe(matrix.total.search);
  });

  it("個別の User-agent ブロックはワイルドカードより優先される", () => {
    const robotsTxt = "User-agent: *\nDisallow: /\n\nUser-agent: GPTBot\nAllow: /\n";
    const matrix = evaluateAiBots(robotsTxt, pageUrl, robotsUrl);
    expect(matrix.bots.find((b) => b.ua === "GPTBot")?.allowed).toBe(true);
    expect(matrix.bots.find((b) => b.ua === "Googlebot")?.allowed).toBe(false);
  });

  it("パスごとの Disallow は対象 URL にだけ効く", () => {
    const robotsTxt = "User-agent: *\nDisallow: /private/\n";
    expect(evaluateAiBots(robotsTxt, pageUrl, robotsUrl).bots.every((b) => b.allowed)).toBe(true);
    const blocked = evaluateAiBots(robotsTxt, "https://example.test/private/x", robotsUrl);
    expect(blocked.bots.every((b) => !b.allowed)).toBe(true);
  });

  it("より長く一致する Allow が Disallow に勝つ", () => {
    const robotsTxt = "User-agent: *\nDisallow: /service/\nAllow: /service/public/\n";
    const allowed = evaluateAiBots(robotsTxt, "https://example.test/service/public/a", robotsUrl);
    expect(allowed.bots.every((b) => b.allowed)).toBe(true);
  });

  it("用途ごとの集計が合う", () => {
    const matrix = evaluateAiBots("User-agent: *\nAllow: /\n", pageUrl, robotsUrl);
    expect(matrix.total.training + matrix.total.search + matrix.total.user).toBe(AI_BOTS.length);
    expect(matrix.blocked).toEqual({ training: 0, search: 0, user: 0 });
  });

  it("必要な UA がすべて含まれている（docs §2.2 の一覧）", () => {
    const uas = AI_BOTS.map((b) => b.ua);
    for (const required of [
      "GPTBot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "ClaudeBot",
      "Claude-User",
      "Claude-SearchBot",
      "anthropic-ai",
      "Googlebot",
      "Google-Extended",
      "PerplexityBot",
      "Perplexity-User",
      "Bingbot",
      "CCBot",
      "Bytespider",
      "Applebot-Extended",
      "Amazonbot",
      "meta-externalagent",
      "cohere-ai",
      "DuckAssistBot",
      "YouBot",
    ]) {
      expect(uas).toContain(required);
    }
  });
});

describe("PSI の扱い", () => {
  it("渡されなければ null のまま、エラー文言だけ保持する", () => {
    const report = buildPageReport(fetched(idealHtml()), siteFiles(), {
      psi: null,
      psiError: "呼び出し上限に達しました",
    });
    expect(report.psi).toBeNull();
    expect(report.psiError).toBe("呼び出し上限に達しました");
    // PSI が無くてもスコアは出る（配点に含めていない）
    expect(report.score).toBeGreaterThan(0);
  });
});

describe("測れていない行を満点にしない", () => {
  // 空の HTML でも「検証していない項目」が満点で加点されないことを確かめる。
  // ここが満点になると、内容の薄いページのスコアが実態より高く出る。
  const bare = `<!doctype html><html lang="ja"><head><title>空のページです</title></head><body><main><p>短い本文。</p></main></body></html>`;

  it("JSON-LD が 1 件も無ければ「文法の正しさ」は満点にしない", () => {
    const report = buildPageReport(fetched(bare), siteFiles());
    const row = rowOf(report, "structuredData", "文法の正しさ");
    expect(row.content).toContain("検証していません");
    expect(row.status).not.toBe("適切");
  });

  it("リンクが 1 本も無ければ「アンカーテキストの具体性」は満点にしない", () => {
    const report = buildPageReport(fetched(bare), siteFiles());
    const row = rowOf(report, "internalLinks", "アンカーテキストの具体性");
    expect(row.content).toContain("リンクがありません");
    expect(row.status).not.toBe("適切");
    expect(row.note).toContain("評価できません");
  });

  it("リンクもJSON-LDもある理想のページでは満点になる", () => {
    const report = buildPageReport(fetched(idealHtml()), siteFiles());
    expect(rowOf(report, "structuredData", "文法の正しさ").status).toBe("適切");
    expect(rowOf(report, "internalLinks", "アンカーテキストの具体性").status).toBe("適切");
  });
});
