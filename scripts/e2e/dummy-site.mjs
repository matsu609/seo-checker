#!/usr/bin/env node
/**
 * E2E スモークテスト用のダミーサイト（依存なし・node:http だけで動く）。
 *
 * 無料診断の「サイト全体」診断（sitemap 展開 + 内部リンク BFS）に、診断しがいの
 * ある小さなサイトを与えるためのもの。中身は次のとおり（ここに書いてあるものが
 * すべて。増減させたときはこのコメントと EXPECTED_PATHS を必ず合わせる）。
 *
 * ■ サイト共通のファイル
 * - /robots.txt   … `Sitemap: <origin>/sitemap.xml` の行を持つ。
 *                   User-agent: GPTBot は Allow: /、User-agent: CCBot だけ
 *                   Disallow: /（→「一部のAIクローラがブロックされている」warn）。
 * - /sitemap.xml  … sitemapindex。/sitemap-1.xml と /sitemap-2.xml を参照する。
 * - /sitemap-1.xml … urlset 7 件: / /company /service /service/a /service/b /blog /news
 * - /sitemap-2.xml … urlset 7 件: /blog/post-1〜/blog/post-5 /contact /recruit
 *                   → sitemap に載る HTML ページは合計 14 件。
 * - /llms.txt     … 置かない（404 → llms.txt の項目が warn になる）。
 * - /llms-full.txt … 置かない（404 → 参考項目が info のまま）。
 *
 * ■ HTML ページ（品質をわざとばらつかせてある）
 * | パス            | 特徴 |
 * |-----------------|------|
 * | /               | 良好。title・description（全角 60〜80 字）・OGP・canonical・lang="ja"・
 * |                 | h1 は 1 個・JSON-LD @graph（Organization + WebSite + sameAs）・
 * |                 | 日本語の本文 1,500 文字以上・img はすべて alt 付き |
 * | /company        | 表（table）中心。JSON-LD は BreadcrumbList のみで WebSite が無い |
 * | /service        | 子ページ /service/a・/service/b への入口 |
 * | /service/a      | meta description が無い（nested・欠落の例） |
 * | /service/b      | 普通。/service/a?utm_source=x へリンクする |
 * | /blog           | 記事一覧。/blog/post-1〜5 へリンクする |
 * | /blog/post-1    | FAQPage の JSON-LD がある |
 * | /blog/post-2    | h1 が 2 個ある |
 * | /blog/post-3    | 見出しレベルが飛ぶ（h2 → h4）。/missing（404）へのリンクを持つ |
 * | /blog/post-4    | 本文 200 文字未満の薄いページ |
 * | /blog/post-5    | JSON-LD の構文が壊れている（末尾カンマ） |
 * | /contact        | alt の無い画像がある。h1 が無い |
 * | /news           | 普通。/deep/1 へのリンクを持つ（sitemap に載らない導線の入口） |
 * | /recruit        | 普通 |
 * | /deep/1 → /deep/2 → /deep/3 | sitemap に載せない。内部リンクからのみ到達できる
 * |                 | （リンク BFS の確認用。/news → /deep/1 → /deep/2 → /deep/3） |
 *
 * ■ クロールの端に置いてあるもの
 * - /missing … 404 を返す（/blog/post-3 からリンク。「診断できなかったページ」に出る）
 * - https://example.com/external … 別オリジンのリンク（全ページのフッター。対象外になるはず）
 * - /file.pdf … HTML でないリンク（全ページのフッター。拡張子で除外されるはず）
 * - /service/a・/service/a/・/service/a?utm_source=x の 3 通りで同じページに到達できる
 *   （正規化されて 1 ページとして診断されるはず）
 *
 * ■ 応答の共通仕様
 * - すべての応答が charset=utf-8。
 * - すべての応答に 5〜15ms の人工的な遅延を入れる（進捗ストリームを観察できるように）。
 *   進捗パネルを撮りたいときだけ --delay 150 のように延ばせる（既定は 5〜15ms のまま）。
 *
 * ■ 使い方
 *   node scripts/e2e/dummy-site.mjs [--port 3199] [--delay 5-15]
 *                                                  # 起動（PORT 環境変数でも指定可）
 *     起動時に readiness の 1 行 JSON を stdout に出す:
 *       {"ready":true,"origin":"http://127.0.0.1:3199","htmlPages":17}
 *   node scripts/e2e/dummy-site.mjs --print-expected # 起動せずに期待値だけ出す
 *     クローラが最終的に診断するはずの正規化済み URL 一覧（1 行 JSON）:
 *       {"origin":"…","expectedCount":17,"expected":[…],"sitemapPages":14,"linkOnlyPages":3}
 *
 * lib.mjs からは startDummySite() でプロセス内に立てて使う。
 */

import { createServer } from "node:http";
import process from "node:process";
import { pathToFileURL } from "node:url";

/** 既定のポート。PORT 環境変数か --port で上書きできる */
export const DEFAULT_PORT = 3199;
/** 応答に入れる人工的な遅延（ミリ秒）の範囲 */
const MIN_DELAY_MS = 5;
const MAX_DELAY_MS = 15;

/** sitemap-1.xml に載せるページ */
export const SITEMAP_1_PATHS = ["/", "/company", "/service", "/service/a", "/service/b", "/blog", "/news"];
/** sitemap-2.xml に載せるページ */
export const SITEMAP_2_PATHS = [
  "/blog/post-1",
  "/blog/post-2",
  "/blog/post-3",
  "/blog/post-4",
  "/blog/post-5",
  "/contact",
  "/recruit",
];
/** sitemap に載せず、内部リンクからのみ到達できるページ */
export const LINK_ONLY_PATHS = ["/deep/1", "/deep/2", "/deep/3"];
/** クローラが最終的に診断するはずのページ（正規化後のパス） */
export const EXPECTED_PATHS = [...SITEMAP_1_PATHS, ...SITEMAP_2_PATHS, ...LINK_ONLY_PATHS];

/** origin（末尾スラッシュ無し）を絶対 URL に */
function abs(origin, path) {
  return path === "/" ? `${origin}/` : `${origin}${path}`;
}

/**
 * クローラが最終的に診断するはずの URL 一覧（canonicalizeUrl と同じ形）。
 * `--print-expected` が出すものと同じ。アサーションはこれを使う。
 */
export function expectedPageUrls(origin) {
  const base = String(origin).replace(/\/+$/, "");
  return EXPECTED_PATHS.map((path) => abs(base, path));
}

/** `--print-expected` が出す 1 行 JSON の中身 */
export function expectedInfo(origin) {
  const base = String(origin).replace(/\/+$/, "");
  return {
    origin: base,
    expectedCount: EXPECTED_PATHS.length,
    expected: expectedPageUrls(base),
    sitemapPages: SITEMAP_1_PATHS.length + SITEMAP_2_PATHS.length,
    linkOnlyPages: LINK_ONLY_PATHS.length,
    notDiagnosed: {
      notFound: [abs(base, "/missing")],
      offOrigin: ["https://example.com/external"],
      nonHtml: [abs(base, "/file.pdf")],
      duplicates: [abs(base, "/service/a") + "/", abs(base, "/service/a") + "?utm_source=x"],
    },
  };
}

// ---------------------------------------------------------------------------
// 本文の材料（架空の制作会社「サンプル工房」）
// ---------------------------------------------------------------------------

/** 本文に使う日本語の文。ページごとに開始位置をずらして使い回す */
const SENTENCES = [
  "サンプル工房は、中小企業のウェブサイト制作と運用支援を行う会社です。",
  "検索エンジンだけでなく、生成AIからも引用されるページ作りを重視しています。",
  "制作したサイトの更新作業まで含めて、月額の定額でお引き受けしています。",
  "初回のご相談は無料で、現状のサイトを診断したうえで改善案をご提示します。",
  "過去三年間で、地域の製造業や士業を中心に百二十社の支援実績があります。",
  "公開後の運用では、月次のレポートと改善提案をセットでお届けしています。",
  "構造化データの実装やサイトマップの整備など、技術的な下地から整えます。",
  "記事の執筆は、取材にもとづいて事実関係を確認したうえで進めています。",
  "表示速度の改善では、画像の最適化とキャッシュ設定を優先して見直します。",
  "問い合わせフォームの改善だけで、月間の反響数が二倍になった例もあります。",
  "料金は初期費用三十万円から、運用は月額五万円からご用意しています。",
  "打ち合わせはオンラインでも対応し、遠方のお客様にもご利用いただけます。",
  "制作の進行は、要件整理、設計、実装、公開前確認の四段階に分けています。",
  "公開前には、見出し構造とメタ情報のチェックリストを必ず通しています。",
  "社内には編集者と実装担当が在籍し、文章と技術の両面から改善を進めます。",
  "AI検索での引用を狙う場合は、質問と回答の形に情報を整理すると効果的です。",
  "よくある質問のページは、実際に寄せられた質問をもとに毎月更新しています。",
  "更新の履歴を残すことで、情報がいつ時点のものかを読み手に伝えられます。",
  "画像には必ず代替テキストを付け、内容が文字だけでも伝わるようにします。",
  "見出しは階層を飛ばさず、話題の大小がそのまま構造になるよう整えます。",
  "会社概要のページには、所在地、設立年、代表者名、事業内容を明記します。",
  "サービスの説明では、対象となる企業規模と想定する課題を先に書きます。",
  "導入事例では、課題、施策、結果の三点を具体的な数値とともに記載します。",
  "お問い合わせから三営業日以内に、担当者よりご連絡を差し上げています。",
];

/** SENTENCES を offset から count 文つないだ段落 */
function para(count, offset = 0) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(SENTENCES[(offset + i) % SENTENCES.length]);
  return `<p>${out.join("")}</p>`;
}

/** h2 見出し + 段落のセクション */
function sec(heading, paragraphs, sentences, offset) {
  const body = [];
  for (let i = 0; i < paragraphs; i += 1) body.push(para(sentences, offset + i * sentences));
  return `<h2>${heading}</h2>\n${body.join("\n")}`;
}

/** 全ページ共通のナビゲーション（相対リンクなのでホスト名に依存しない） */
const NAV = `<nav aria-label="グローバルナビゲーション">
<ul>
<li><a href="/">ホーム</a></li>
<li><a href="/company">会社概要</a></li>
<li><a href="/service">サービス</a></li>
<li><a href="/blog">ブログ</a></li>
<li><a href="/news">お知らせ</a></li>
<li><a href="/recruit">採用情報</a></li>
<li><a href="/contact">お問い合わせ</a></li>
</ul>
</nav>`;

/**
 * 全ページ共通のフッター。
 * 別オリジンのリンクと HTML でないリンクを必ず 1 つずつ含める（どちらも
 * クロール対象外になるはず）。
 */
const FOOTER = `<footer>
<p><a href="https://example.com/external">サンプル外部サイト</a>／<a href="/file.pdf">会社案内（PDF）</a></p>
<p>&copy; 2026 サンプル工房</p>
</footer>`;

/** JSON-LD を 1 ブロックに整形する */
function ld(data) {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
}

/** パンくずの JSON-LD（どのページでも使い回す） */
function breadcrumb(origin, trail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: abs(origin, item.path),
    })),
  };
}

/**
 * 1 ページ分の HTML を組み立てる。
 * `head` に足りないものを意図的に外せるように、引数はすべて任意にしてある。
 */
function renderPage(origin, options) {
  const {
    path,
    lang = "ja",
    title,
    description = null,
    canonical = true,
    ogType = "website",
    ogImage = true,
    jsonLd = [],
    rawJsonLd = [],
    main,
  } = options;
  const url = abs(origin, path);
  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${title}</title>`,
  ];
  if (description) head.push(`<meta name="description" content="${description}">`);
  if (canonical) head.push(`<link rel="canonical" href="${url}">`);
  if (ogType) {
    head.push(`<meta property="og:type" content="${ogType}">`);
    head.push(`<meta property="og:title" content="${title}">`);
    head.push(`<meta property="og:url" content="${url}">`);
    if (description) head.push(`<meta property="og:description" content="${description}">`);
    if (ogImage) head.push(`<meta property="og:image" content="${abs(origin, "/img/ogp.svg")}">`);
  }
  for (const data of jsonLd) head.push(ld(data));
  for (const raw of rawJsonLd) head.push(`<script type="application/ld+json">\n${raw}\n</script>`);

  return `<!doctype html>
<html lang="${lang}">
<head>
${head.join("\n")}
</head>
<body>
${NAV}
${main}
${FOOTER}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// ページ定義
// ---------------------------------------------------------------------------

const SITE_NAME = "サンプル工房";
const TOP_DESCRIPTION =
  "サンプル工房は、中小企業のウェブサイト制作と運用を支援する会社です。検索エンジンと生成AIの両方に伝わるページ設計を、初回無料の診断からご提案します。";

/** トップページ（良好な例）の本文。日本語で 1,500 文字以上になるようにしてある */
function topMain() {
  return `<main>
<article>
<h1>サンプル工房｜中小企業のウェブサイト制作と運用支援</h1>
<p>${SENTENCES[0]}${SENTENCES[1]}${SENTENCES[3]}</p>
<figure>
<img src="/img/office.svg" width="480" height="270" alt="制作チームが打ち合わせをしている様子">
<figcaption>編集者と実装担当が同じ場で改善案を検討します。</figcaption>
</figure>
${sec("私たちができること", 2, 4, 0)}
${sec("支援の進め方", 2, 4, 8)}
${sec("料金とご相談の流れ", 2, 4, 16)}
${sec("AI検索に引用されるための下ごしらえ", 2, 4, 4)}
${sec("公開後の運用と改善", 2, 4, 12)}
${sec("導入事例のご紹介", 2, 4, 20)}
${sec("よくあるご質問", 2, 4, 2)}
${sec("ご相談いただく前に", 2, 4, 14)}
<figure>
<img src="/img/chart.svg" width="480" height="270" alt="支援開始後に問い合わせ件数が増えた推移を示す折れ線グラフ">
<figcaption>支援開始から六か月間の問い合わせ件数の推移です。</figcaption>
</figure>
<h2>関連ページ</h2>
<ul>
<li><a href="/service/a/">制作プラン（末尾スラッシュ付きのリンク）</a></li>
<li><a href="/blog/post-1">よくある質問のまとめ</a></li>
<li><a href="/company">会社概要</a></li>
</ul>
</article>
</main>`;
}

/** 会社概要（表中心のページ） */
function companyMain() {
  return `<main>
<article>
<h1>会社概要</h1>
<p>${SENTENCES[20]}${SENTENCES[0]}</p>
<h2>基本情報</h2>
<table>
<caption>会社の基本情報</caption>
<tbody>
<tr><th>会社名</th><td>株式会社サンプル工房</td></tr>
<tr><th>設立</th><td>2016年4月1日</td></tr>
<tr><th>代表者</th><td>代表取締役 山田 太郎</td></tr>
<tr><th>所在地</th><td>東京都千代田区サンプル一丁目2番3号</td></tr>
<tr><th>資本金</th><td>1,000万円</td></tr>
<tr><th>従業員数</th><td>18名（2026年4月現在）</td></tr>
<tr><th>事業内容</th><td>ウェブサイト制作、運用支援、コンテンツ編集</td></tr>
<tr><th>取引銀行</th><td>サンプル銀行 千代田支店</td></tr>
</tbody>
</table>
<h2>沿革</h2>
<table>
<tbody>
<tr><th>2016年</th><td>東京都千代田区にて創業</td></tr>
<tr><th>2019年</th><td>運用支援サービスを開始</td></tr>
<tr><th>2022年</th><td>構造化データの実装支援を開始</td></tr>
<tr><th>2025年</th><td>生成AI向けの情報整理サービスを開始</td></tr>
</tbody>
</table>
${sec("私たちの考え方", 1, 4, 18)}
<p><a href="/service">サービス一覧を見る</a>／<a href="/file.pdf">会社案内をダウンロード（PDF）</a></p>
</article>
</main>`;
}

/** サービス一覧（子ページへの入口） */
function serviceMain() {
  return `<main>
<article>
<h1>サービス一覧</h1>
${sec("ご提供する二つのプラン", 2, 4, 21)}
<h2>プラン</h2>
<ul>
<li><a href="/service/a">制作プラン（新規サイトの立ち上げ）</a></li>
<li><a href="/service/b">運用プラン（公開後の改善）</a></li>
</ul>
<h3>どちらを選べばよいか</h3>
<p>${SENTENCES[21]}${SENTENCES[3]}</p>
</article>
</main>`;
}

/** 制作プラン（meta description が無いページ） */
function serviceAMain() {
  return `<main>
<article>
<h1>制作プラン</h1>
${sec("プランの内容", 2, 4, 12)}
${sec("納品までの期間", 1, 4, 6)}
<h3>ご用意いただくもの</h3>
<p>${SENTENCES[13]}${SENTENCES[19]}</p>
<p><a href="/service">サービス一覧へ戻る</a>／<a href="/contact">お問い合わせ</a></p>
</article>
</main>`;
}

/** 運用プラン（正規化の確認用にクエリ付きリンクを持つ） */
function serviceBMain() {
  return `<main>
<article>
<h1>運用プラン</h1>
${sec("毎月お届けするもの", 2, 4, 5)}
${sec("改善の優先順位", 1, 4, 8)}
<h3>関連ページ</h3>
<p><a href="/service/a?utm_source=x">制作プラン（計測パラメータ付きのリンク）</a>／<a href="/service">サービス一覧</a></p>
</article>
</main>`;
}

/** ブログ一覧 */
function blogMain() {
  return `<main>
<article>
<h1>ブログ</h1>
<p>${SENTENCES[16]}${SENTENCES[17]}</p>
<h2>記事一覧</h2>
<ul>
<li><a href="/blog/post-1">AI検索に引用されるためのよくある質問の書き方</a></li>
<li><a href="/blog/post-2">見出しの付け方で伝わり方が変わる</a></li>
<li><a href="/blog/post-3">構造化データを入れる順番</a></li>
<li><a href="/blog/post-4">臨時休業のお知らせ</a></li>
<li><a href="/blog/post-5">サイトマップの作り方</a></li>
</ul>
${sec("編集方針", 1, 4, 7)}
</article>
</main>`;
}

/** 記事 1: FAQPage の JSON-LD がある */
function post1Main() {
  return `<main>
<article>
<h1>AI検索に引用されるためのよくある質問の書き方</h1>
${sec("質問と回答の形に整理する", 2, 4, 15)}
<h2>よくある質問</h2>
<dl>
<dt>制作にはどれくらいの期間がかかりますか。</dt>
<dd>要件整理から公開まで、標準的なコーポレートサイトで約三か月です。</dd>
<dt>費用はどれくらいですか。</dt>
<dd>初期費用三十万円から、運用は月額五万円からご用意しています。</dd>
<dt>遠方でも依頼できますか。</dt>
<dd>打ち合わせはオンラインでも対応しているため、全国からご依頼いただけます。</dd>
</dl>
${sec("回答は結論から書く", 1, 4, 3)}
<p><a href="/blog">ブログ一覧へ戻る</a>／<a href="/contact">お問い合わせ</a></p>
</article>
</main>`;
}

/** 記事 2: h1 が 2 個ある */
function post2Main() {
  return `<main>
<article>
<h1>見出しの付け方で伝わり方が変わる</h1>
${sec("見出しは文章の地図になる", 2, 4, 19)}
<h1>後半: 実際の直し方</h1>
${sec("直す順番", 1, 4, 13)}
<p><a href="/blog">ブログ一覧へ戻る</a></p>
</article>
</main>`;
}

/** 記事 3: 見出しレベルが h2 → h4 に飛ぶ。404 になるリンクを持つ */
function post3Main() {
  return `<main>
<article>
<h1>構造化データを入れる順番</h1>
<h2>まず Organization と WebSite から</h2>
${para(4, 6)}
<h4>次に BreadcrumbList</h4>
${para(4, 10)}
<h4>最後に FAQPage</h4>
${para(4, 14)}
<p><a href="/missing">古い記事（現在は削除されています）</a>／<a href="/blog">ブログ一覧へ戻る</a></p>
</article>
</main>`;
}

/** 記事 4: 本文 200 文字未満の薄いページ */
function post4Main() {
  return `<main>
<article>
<h1>臨時休業のお知らせ</h1>
<p>本日は社内研修のため休業します。</p>
<p><a href="/blog">ブログ一覧へ戻る</a></p>
</article>
</main>`;
}

/** 記事 5: JSON-LD の構文が壊れている */
function post5Main() {
  return `<main>
<article>
<h1>サイトマップの作り方</h1>
${sec("sitemap.xml と sitemapindex", 2, 4, 11)}
${sec("robots.txt から辿れるようにする", 1, 4, 18)}
<p><a href="/blog">ブログ一覧へ戻る</a></p>
</article>
</main>`;
}

/** 問い合わせ: h1 が無く、alt の無い画像がある */
function contactMain() {
  return `<main>
<article>
<h2>お問い合わせ</h2>
<p>${SENTENCES[23]}${SENTENCES[3]}</p>
<img src="/img/map.svg" width="480" height="270">
<h3>連絡先</h3>
<p>電話: 03-0000-0000／メール: <a href="mailto:info@example.com">info@example.com</a></p>
<p>所在地: 東京都千代田区サンプル一丁目2番3号</p>
<h3>受付時間</h3>
<p>平日の午前九時から午後六時までです。土日祝日は翌営業日の対応となります。</p>
<p><a href="/company">会社概要を見る</a></p>
</article>
</main>`;
}

/** お知らせ: sitemap に載らない /deep/1 への導線を持つ */
function newsMain() {
  return `<main>
<article>
<h1>お知らせ</h1>
${sec("最近の更新", 2, 4, 17)}
<h2>特集ページ</h2>
<ul>
<li><a href="/deep/1">特集: 生成AI時代のサイト運用（第1回）</a></li>
</ul>
${sec("お知らせの掲載方針", 1, 4, 22)}
</article>
</main>`;
}

/** 採用情報 */
function recruitMain() {
  return `<main>
<article>
<h1>採用情報</h1>
${sec("募集職種", 2, 4, 9)}
${sec("働き方", 1, 4, 1)}
<h3>選考の流れ</h3>
<p>書類選考、一次面接、二次面接の三段階です。応募から二週間以内に結果をお伝えします。</p>
<p><a href="/company">会社概要</a>／<a href="/contact">お問い合わせ</a></p>
</article>
</main>`;
}

/** 特集ページ（1〜3）。sitemap に載せず、内部リンクだけで数珠つなぎにする */
function deepMain(index) {
  const next = index < 3 ? `<p><a href="/deep/${index + 1}">第${index + 1}回へ進む</a></p>` : `<p><a href="/news">お知らせ一覧へ戻る</a></p>`;
  return `<main>
<article>
<h1>特集: 生成AI時代のサイト運用（第${index}回）</h1>
${sec("この回で扱うこと", 2, 4, index * 5)}
${sec("まとめ", 1, 4, index * 3 + 2)}
${next}
</article>
</main>`;
}

// ---------------------------------------------------------------------------
// ルーティング
// ---------------------------------------------------------------------------

/** robots.txt。GPTBot は許可、CCBot だけ拒否。Sitemap 行を持つ */
function robotsTxt(origin) {
  return `# サンプル工房（E2E スモークテスト用のダミーサイト）
User-agent: *
Allow: /
Disallow: /private/

# 学習用クローラは許可する
User-agent: GPTBot
Allow: /

# Common Crawl だけ拒否する（AIクローラの項目が「一部ブロック」になる）
User-agent: CCBot
Disallow: /

Sitemap: ${origin}/sitemap.xml
`;
}

/** sitemapindex（/sitemap-1.xml と /sitemap-2.xml を参照する） */
function sitemapIndexXml(origin) {
  const entries = ["/sitemap-1.xml", "/sitemap-2.xml"]
    .map((path) => `  <sitemap>\n    <loc>${abs(origin, path)}</loc>\n    <lastmod>2026-08-01</lastmod>\n  </sitemap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</sitemapindex>
`;
}

/** urlset */
function urlsetXml(origin, paths) {
  const entries = paths
    .map(
      (path) =>
        `  <url>\n    <loc>${abs(origin, path)}</loc>\n    <lastmod>2026-08-01</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

/** 画像の代わりに置く極小の SVG（外部リソースを増やさないため中身は単色） */
function svg(label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270" role="img" aria-label="${label}"><rect width="480" height="270" fill="#e2eef3"/><text x="240" y="140" font-size="20" text-anchor="middle" fill="#14607a">${label}</text></svg>
`;
}

/** 最小限の PDF（HTML でないリンクの実体） */
const FILE_PDF = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
trailer << /Root 1 0 R >>
%%EOF
`;

const HTML_TYPE = "text/html; charset=utf-8";
const XML_TYPE = "application/xml; charset=utf-8";

/** origin ごとの応答表を作る（絶対 URL を含むため origin に依存する） */
function buildRoutes(origin) {
  const routes = new Map();
  const page = (path, options) =>
    routes.set(path, { status: 200, type: HTML_TYPE, body: renderPage(origin, { path, ...options }) });
  const file = (path, type, body, status = 200) => routes.set(path, { status, type, body });

  page("/", {
    title: `${SITE_NAME}｜中小企業のウェブサイト制作と運用支援`,
    description: TOP_DESCRIPTION,
    main: topMain(),
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Organization",
            "@id": `${origin}/#organization`,
            name: "株式会社サンプル工房",
            url: `${origin}/`,
            sameAs: ["https://example.com/sample-koubou", "https://example.org/sample-koubou"],
            address: {
              "@type": "PostalAddress",
              addressCountry: "JP",
              addressRegion: "東京都",
              addressLocality: "千代田区",
              streetAddress: "サンプル一丁目2番3号",
            },
          },
          {
            "@type": "WebSite",
            "@id": `${origin}/#website`,
            name: SITE_NAME,
            url: `${origin}/`,
            inLanguage: "ja",
            publisher: { "@id": `${origin}/#organization` },
            potentialAction: {
              "@type": "SearchAction",
              target: `${origin}/?q={search_term_string}`,
              "query-input": "required name=search_term_string",
            },
          },
        ],
      },
    ],
  });

  page("/company", {
    title: `会社概要｜${SITE_NAME}`,
    description:
      "株式会社サンプル工房の会社概要です。設立年、所在地、代表者、事業内容、沿革を掲載しています。",
    main: companyMain(),
    jsonLd: [breadcrumb(origin, [{ name: "ホーム", path: "/" }, { name: "会社概要", path: "/company" }])],
  });

  page("/service", {
    title: `サービス一覧｜${SITE_NAME}`,
    description:
      "サンプル工房のサービス一覧です。新規サイトの制作プランと、公開後の運用プランをご用意しています。",
    main: serviceMain(),
    jsonLd: [breadcrumb(origin, [{ name: "ホーム", path: "/" }, { name: "サービス", path: "/service" }])],
  });

  // meta description を意図的に付けない
  page("/service/a", {
    title: `制作プラン｜${SITE_NAME}`,
    main: serviceAMain(),
    jsonLd: [
      breadcrumb(origin, [
        { name: "ホーム", path: "/" },
        { name: "サービス", path: "/service" },
        { name: "制作プラン", path: "/service/a" },
      ]),
    ],
  });

  page("/service/b", {
    title: `運用プラン｜${SITE_NAME}`,
    description:
      "公開後のウェブサイトを毎月改善する運用プランです。月次レポートと改善提案をセットでお届けします。",
    main: serviceBMain(),
    jsonLd: [
      breadcrumb(origin, [
        { name: "ホーム", path: "/" },
        { name: "サービス", path: "/service" },
        { name: "運用プラン", path: "/service/b" },
      ]),
    ],
  });

  page("/blog", {
    title: `ブログ｜${SITE_NAME}`,
    description: "ウェブサイトの制作と運用に関する記事を掲載しています。毎月の更新分をまとめました。",
    main: blogMain(),
    jsonLd: [breadcrumb(origin, [{ name: "ホーム", path: "/" }, { name: "ブログ", path: "/blog" }])],
  });

  page("/blog/post-1", {
    title: `AI検索に引用されるためのよくある質問の書き方｜${SITE_NAME}`,
    description:
      "生成AIに引用されやすいよくある質問の書き方を、質問文の粒度と回答の順序の観点から解説します。",
    ogType: "article",
    main: post1Main(),
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [
          {
            "@type": "Question",
            name: "制作にはどれくらいの期間がかかりますか。",
            acceptedAnswer: {
              "@type": "Answer",
              text: "要件整理から公開まで、標準的なコーポレートサイトで約三か月です。",
            },
          },
          {
            "@type": "Question",
            name: "費用はどれくらいですか。",
            acceptedAnswer: {
              "@type": "Answer",
              text: "初期費用三十万円から、運用は月額五万円からご用意しています。",
            },
          },
        ],
      },
      breadcrumb(origin, [
        { name: "ホーム", path: "/" },
        { name: "ブログ", path: "/blog" },
        { name: "よくある質問の書き方", path: "/blog/post-1" },
      ]),
    ],
  });

  // h1 が 2 個
  page("/blog/post-2", {
    title: `見出しの付け方で伝わり方が変わる｜${SITE_NAME}`,
    description: "見出しの階層と本文の関係を整理し、読み手にも機械にも伝わる構造の作り方を説明します。",
    ogType: "article",
    main: post2Main(),
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: "見出しの付け方で伝わり方が変わる",
        datePublished: "2026-06-02",
        author: { "@type": "Organization", name: "株式会社サンプル工房" },
      },
    ],
  });

  // 見出しレベルが h2 → h4 に飛ぶ
  page("/blog/post-3", {
    title: `構造化データを入れる順番｜${SITE_NAME}`,
    description: "構造化データをどの順番で実装すると効果が出やすいかを、実際の作業手順に沿って紹介します。",
    ogType: "article",
    main: post3Main(),
    jsonLd: [
      {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: "構造化データを入れる順番",
        datePublished: "2026-06-20",
        author: { "@type": "Organization", name: "株式会社サンプル工房" },
      },
    ],
  });

  // 本文が極端に短く、OGP も無いページ
  page("/blog/post-4", {
    title: `臨時休業のお知らせ｜${SITE_NAME}`,
    ogType: null,
    main: post4Main(),
  });

  // JSON-LD の構文エラー（末尾カンマ）
  page("/blog/post-5", {
    title: `サイトマップの作り方｜${SITE_NAME}`,
    description: "sitemap.xml と sitemapindex の違い、robots.txt からの参照方法をまとめました。",
    ogType: "article",
    main: post5Main(),
    rawJsonLd: [
      `{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "サイトマップの作り方",
  "datePublished": "2026-07-08",
}`,
    ],
  });

  page("/contact", {
    title: `お問い合わせ｜${SITE_NAME}`,
    description: "サンプル工房へのお問い合わせ窓口です。電話とメールで受け付けています。",
    main: contactMain(),
    jsonLd: [breadcrumb(origin, [{ name: "ホーム", path: "/" }, { name: "お問い合わせ", path: "/contact" }])],
  });

  page("/news", {
    title: `お知らせ｜${SITE_NAME}`,
    description: "サンプル工房からのお知らせと、特集ページの更新情報を掲載しています。",
    main: newsMain(),
    jsonLd: [breadcrumb(origin, [{ name: "ホーム", path: "/" }, { name: "お知らせ", path: "/news" }])],
  });

  page("/recruit", {
    title: `採用情報｜${SITE_NAME}`,
    description: "サンプル工房の採用情報です。募集職種、働き方、選考の流れを掲載しています。",
    main: recruitMain(),
    jsonLd: [breadcrumb(origin, [{ name: "ホーム", path: "/" }, { name: "採用情報", path: "/recruit" }])],
  });

  for (const index of [1, 2, 3]) {
    page(`/deep/${index}`, {
      title: `特集: 生成AI時代のサイト運用（第${index}回）｜${SITE_NAME}`,
      description: `生成AI時代のサイト運用について、第${index}回として運用の現場で確認していることをまとめました。`,
      ogType: "article",
      main: deepMain(index),
    });
  }

  file("/robots.txt", "text/plain; charset=utf-8", robotsTxt(origin));
  file("/sitemap.xml", XML_TYPE, sitemapIndexXml(origin));
  file("/sitemap-1.xml", XML_TYPE, urlsetXml(origin, SITEMAP_1_PATHS));
  file("/sitemap-2.xml", XML_TYPE, urlsetXml(origin, SITEMAP_2_PATHS));
  file("/file.pdf", "application/pdf; charset=utf-8", FILE_PDF);
  file("/img/ogp.svg", "image/svg+xml; charset=utf-8", svg("OGP"));
  file("/img/office.svg", "image/svg+xml; charset=utf-8", svg("OFFICE"));
  file("/img/chart.svg", "image/svg+xml; charset=utf-8", svg("CHART"));
  file("/img/map.svg", "image/svg+xml; charset=utf-8", svg("MAP"));

  return routes;
}

/** 404 のページ（/missing など） */
function notFoundHtml(pathname) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>ページが見つかりません｜${SITE_NAME}</title>
</head>
<body>
${NAV}
<main><h1>ページが見つかりません</h1><p>お探しのページ（${pathname}）は見つかりませんでした。</p></main>
${FOOTER}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// サーバー
// ---------------------------------------------------------------------------

/** HTML に埋め込む前に最低限のエスケープをする（404 のパス表示用） */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 進捗ストリームが観察できるように、応答をわずかに遅らせる。
 * 既定は 5〜15ms。スモークテストで進捗パネルを撮りたいときだけ、呼び出し側が
 * もう少し長い値（--delay / startDummySite({ delayMs })）を指定できる。
 */
function artificialDelay(minMs, maxMs) {
  const low = Number.isFinite(minMs) ? Math.max(0, minMs) : MIN_DELAY_MS;
  const high = Number.isFinite(maxMs) ? Math.max(low, maxMs) : Math.max(low, MAX_DELAY_MS);
  const ms = low + Math.floor(Math.random() * (high - low + 1));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function send(res, status, type, body, headOnly = false) {
  const buffer = Buffer.from(body, "utf8");
  res.writeHead(status, {
    "content-type": type,
    "content-length": String(buffer.byteLength),
    "cache-control": "no-store",
  });
  if (headOnly) res.end();
  else res.end(buffer);
}

/**
 * ダミーサイトの http.Server を作る（listen はしない）。
 * 絶対 URL は Host ヘッダから組み立てるので、127.0.0.1 でも localhost でも
 * リンクの向き先が食い違わない。
 */
export function createDummySite(options = {}) {
  const fallbackHost = options.fallbackHost ?? `127.0.0.1:${DEFAULT_PORT}`;
  const minDelayMs = Number.isFinite(options.minDelayMs) ? options.minDelayMs : MIN_DELAY_MS;
  const maxDelayMs = Number.isFinite(options.maxDelayMs) ? options.maxDelayMs : MAX_DELAY_MS;
  let cached = null;

  const routesFor = (origin) => {
    if (!cached || cached.origin !== origin) cached = { origin, routes: buildRoutes(origin) };
    return cached.routes;
  };

  return createServer((req, res) => {
    const origin = `http://${req.headers.host || fallbackHost}`;
    let pathname = "/";
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", origin).pathname);
    } catch {
      pathname = req.url ?? "/";
    }
    // 末尾スラッシュの有無は同じページとして扱う（/service/a/ → /service/a）
    const key = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : "/";
    const headOnly = req.method === "HEAD";

    artificialDelay(minDelayMs, maxDelayMs)
      .then(() => {
        if (req.method !== "GET" && !headOnly) {
          send(res, 405, HTML_TYPE, notFoundHtml(escapeHtml(key)), false);
          return;
        }
        const route = routesFor(origin).get(key);
        if (!route) {
          send(res, 404, HTML_TYPE, notFoundHtml(escapeHtml(key)), headOnly);
          return;
        }
        send(res, route.status ?? 200, route.type, route.body, headOnly);
      })
      .catch(() => {
        if (!res.headersSent) send(res, 500, HTML_TYPE, notFoundHtml("error"), headOnly);
        else res.end();
      });
  });
}

function listenOnce(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

/**
 * ダミーサイトを起動する。
 * ポートが埋まっていたら +1 して最大 20 回まで試し、実際に使ったポートを返す。
 * 返り値の expected は「クローラが診断するはずの URL 一覧」（--print-expected と同じ）。
 */
export async function startDummySite(options = {}) {
  const host = options.host ?? "127.0.0.1";
  const requested = Number(options.port ?? process.env.PORT ?? DEFAULT_PORT) || DEFAULT_PORT;
  const attempts = Math.max(1, options.portAttempts ?? 20);
  const delayMs = Number.isFinite(options.delayMs) ? Number(options.delayMs) : null;
  const server = createDummySite({
    fallbackHost: `${host}:${requested}`,
    minDelayMs: options.minDelayMs ?? delayMs ?? undefined,
    maxDelayMs: options.maxDelayMs ?? (delayMs === null ? undefined : delayMs + 10),
  });
  server.keepAliveTimeout = 1_000;

  let port = requested;
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await listenOnce(server, port, host);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if (err && err.code === "EADDRINUSE") {
        port += 1;
        continue;
      }
      break;
    }
  }
  if (lastError) {
    throw new Error(
      `ダミーサイトを起動できませんでした（${host}:${requested} から ${attempts} ポート試行）: ${lastError.message}`,
    );
  }
  if (port !== requested) {
    process.stderr.write(`[dummy-site] ポート ${requested} が使用中のため ${port} で起動しました\n`);
  }

  const origin = `http://${host}:${port}`;
  return {
    origin,
    host,
    port,
    server,
    htmlPages: EXPECTED_PATHS.length,
    expected: expectedPageUrls(origin),
    info: expectedInfo(origin),
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/** --port / --port=N / PORT からポートを決める */
export function parsePort(argv = [], env = {}) {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port" || arg === "-p") {
      const value = Number(argv[i + 1]);
      if (Number.isFinite(value) && value > 0) return value;
    }
    const inline = /^--port=(\d+)$/.exec(arg);
    if (inline) return Number(inline[1]);
  }
  const fromEnv = Number(env.PORT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_PORT;
}

/** `--delay 200` / `--delay 100-300` を { minDelayMs, maxDelayMs } にする */
export function parseDelay(value) {
  const range = /^(\d+)-(\d+)$/.exec(String(value));
  if (range) return { minDelayMs: Number(range[1]), maxDelayMs: Number(range[2]) };
  const single = Number(value);
  if (Number.isFinite(single) && single >= 0) return { minDelayMs: single, maxDelayMs: single + 10 };
  return {};
}

async function main() {
  const argv = process.argv.slice(2);
  const port = parsePort(argv, process.env);
  const hostIndex = argv.indexOf("--host");
  const host = hostIndex >= 0 && argv[hostIndex + 1] ? argv[hostIndex + 1] : "127.0.0.1";
  const delayIndex = argv.indexOf("--delay");
  const delay = delayIndex >= 0 && argv[delayIndex + 1] ? parseDelay(argv[delayIndex + 1]) : {};

  if (argv.includes("--print-expected")) {
    process.stdout.write(`${JSON.stringify(expectedInfo(`http://${host}:${port}`))}\n`);
    return;
  }

  const site = await startDummySite({ port, host, ...delay });
  process.stdout.write(
    `${JSON.stringify({ ready: true, origin: site.origin, htmlPages: site.htmlPages })}\n`,
  );

  const stop = async () => {
    await site.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`[dummy-site] ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
