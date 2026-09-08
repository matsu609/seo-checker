import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { check } from "./check";
import type { CheckResult, CheckStatus } from "./types";

export interface ContentInfo {
  /** Readability で抽出した本文（失敗時は body 全体からナビ等を除いたテキスト） */
  mainText: string;
  mainTextLength: number;
  rawTextLength: number;
  /** 本文抽出に Readability が成功したか */
  readable: boolean;
  images: number;
  imagesWithoutAlt: number;
  scripts: number;
  /** 具体情報（数値・日付・組織名・連絡先）を含む文の数 */
  concreteSentences: number;
  /** 本文の文の総数 */
  totalSentences: number;
  /** 本文領域の h2 / h3 の数 */
  mainHeadings: number;
  /** そのうち、直後に本文が続かないもの（見出しだけで中身が無い）の数 */
  headingsWithoutBody: number;
}

/** Readability の抽出結果がこれ未満なら、本文を取り逃したとみなしてフォールバックする */
const MIN_MAIN_TEXT_CHARS = 300;

/**
 * Readability の抽出結果を捨てて、ナビ等を除いた body 全体（フォールバック）を使うか。
 *
 * 以前はここに「フォールバックの 30% 未満しか残っていなければ本文を取り逃している」
 * という相対条件も書かれていたが、`Math.min(300, fallback.length * 0.3)` という
 * 書き方のせいで閾値が 300 文字で頭打ちになり、実際には一度も発動していなかった。
 *
 * 相対条件を有効にすべきか実際の HTML で確かめたところ、有効にしない方が正しい:
 *   - 会社概要のような table / dl 中心のページでは、Readability は本文をほぼ
 *     取りこぼさない（抽出結果はフォールバックの 88〜100%）。相対条件の出番がない。
 *   - 相対条件が効くのは「本文が短く、関連記事リストなどが大量にあるページ」で、
 *     そこで拾えるのはリンクの羅列＝ボイラープレート。フォールバックに切り替えると
 *     本文量を水増しして評価してしまう。しかもその手のページは抽出結果自体が
 *     300 文字未満になるため、下の絶対条件で既に拾えている。
 *
 * よって判定は「抽出結果が絶対量として短すぎるか」だけにする。
 */
export function shouldUseFallback(mainTextLength: number): boolean {
  return mainTextLength < MIN_MAIN_TEXT_CHARS;
}

/** 空白を潰し、長さの比較に使える形へ */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 文字数として数える単位: 空白と記号を除いた長さ */
export function countChars(text: string): number {
  return normalizeText(text).replace(/[\s\p{P}\p{S}]/gu, "").length;
}

/* ─────────────────────────────────────────────────────────────
   本文の「具体性」を測る。

   以前はここが「1,500 文字あるか」だった。Google は推奨文字数を持たないと
   明言しており、一覧ページ・問い合わせ・短い告知まで一律に減点していたため
   採点として成立していなかった（水増しを促す方向にも働く）。

   代わりに見るのは「AI が引用できる具体的な事実が書いてあるか」。
   数値・日付・組織名・連絡先を含む文を数える。短くても具体的なページ
   （例: 電話番号と受付時間が書かれた問い合わせページ）は通り、長くても
   抽象的なだけのページは通らない。
   ───────────────────────────────────────────────────────────── */

/** 数量（単位・助数詞つきの数字） */
const RE_QUANTITY =
  /\d+(?:[.,]\d+)?\s*(?:円|万円|億円|%|％|人|名|社|件|個|台|回|点|種|品|室|席|階|坪|畳|㎡|平方メートル|km|m|cm|mm|kg|g|t|L|ml|年|ヶ月|か月|カ月|箇月|月|日|週|時間|分|秒|歳|才|位|倍|割|周年|以上|以下|未満)/;
/** 日付・年月 */
const RE_DATE = /\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*日|令和\s*\d+|平成\s*\d+|\d{4}[-/]\d{1,2}[-/]\d{1,2}/;
/** 組織・法人格 */
const RE_ORG =
  /株式会社|有限会社|合同会社|合資会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|NPO法人|独立行政法人|学校法人|医療法人|社会福祉法人/;
/** 連絡先・所在地 */
const RE_CONTACT = /〒\s*\d{3}|\d{2,4}-\d{2,4}-\d{4}|\d{1,2}:\d{2}|TEL|Tel|電話番号/;

const CONCRETE_PATTERNS = [RE_QUANTITY, RE_DATE, RE_ORG, RE_CONTACT];

/** 句点で文に割る。空白しか無い断片は落とす */
export function splitSentences(text: string): string[] {
  return text
    .split(/[。！？!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export interface Specificity {
  concrete: number;
  total: number;
}

/** 具体情報を含む文の数と、文の総数を返す */
export function measureSpecificity(mainText: string): Specificity {
  const sentences = splitSentences(mainText);
  let concrete = 0;
  for (const sentence of sentences) {
    if (CONCRETE_PATTERNS.some((re) => re.test(sentence))) concrete += 1;
  }
  return { concrete, total: sentences.length };
}

/**
 * 本文領域の h2 / h3 のうち、直後に本文が続かないものを数える。
 *
 * 見出しだけあって中身が無いページは、AI が「見出しの問いに対する答え」を
 * 取り出せない。ナビゲーションの見出しを拾わないよう、main / article が
 * あればその中だけを見て、無ければ body からナビ等を外した範囲を見る。
 */
export function measureHeadingBodies($: cheerio.CheerioAPI): {
  headings: number;
  withoutBody: number;
} {
  const $doc = cheerio.load($.html());
  $doc("script, style, noscript, template, svg").remove();
  let scope = $doc("main, article, [role=main]").first();
  if (scope.length === 0) {
    $doc("nav, header, footer, aside, form").remove();
    scope = $doc("body");
  }

  const headings = scope.find("h2, h3").toArray();
  let withoutBody = 0;
  for (const el of headings) {
    let text = "";
    let node = $doc(el).next();
    // 次の見出しに当たるまでの範囲を本文とみなす
    while (node.length > 0 && !node.is("h1, h2, h3, h4, h5, h6")) {
      text += node.text();
      if (countChars(text) >= 10) break;
      node = node.next();
    }
    if (countChars(text) < 10) withoutBody += 1;
  }
  return { headings: headings.length, withoutBody };
}

/**
 * ブロック要素の閉じタグ前に改行を挟む。
 * textContent は要素間に空白を入れないため「見出し本文」のように連結されてしまい、
 * FAQ 生成時に AI が文の切れ目を見失う。
 */
export function separateBlocks(html: string): string {
  return html.replace(/<\/(p|h[1-6]|li|div|section|article|tr|td|th|dt|dd|blockquote|pre)>|<br\s*\/?>/gi, "\n$&");
}

export function extractContent(html: string, url: string, $: cheerio.CheerioAPI): ContentInfo {
  // --- 本文抽出 -------------------------------------------------------------
  let mainText = "";
  let readable = false;
  const spaced = separateBlocks(html);
  try {
    const { document } = parseHTML(spaced);
    // Readability は document.baseURI 等を参照するため、リンク解決用に <base> を補う
    if (!document.querySelector("base") && document.head) {
      const base = document.createElement("base");
      base.setAttribute("href", url);
      document.head.appendChild(base);
    }
    const article = new Readability(document, { charThreshold: 200 }).parse();
    if (article?.textContent) {
      mainText = normalizeText(article.textContent);
      readable = true;
    }
  } catch {
    // linkedom / Readability が対応できない HTML は下のフォールバックへ
  }

  const $clone = cheerio.load(spaced);
  $clone("script, style, noscript, template, svg, nav, header, footer, aside, form").remove();
  const fallback = normalizeText($clone("body").text());

  if (!readable || shouldUseFallback(mainText.length)) {
    mainText = fallback;
    readable = false;
  }

  const $raw = cheerio.load($.html());
  $raw("script, style, noscript, template").remove();
  const rawTextLength = countChars($raw("body").text());

  const images = $("img").length;
  const imagesWithoutAlt = $("img").filter((_, el) => {
    const alt = $(el).attr("alt");
    return alt === undefined || alt.trim() === "";
  }).length;

  const specificity = measureSpecificity(mainText);
  const headingBodies = measureHeadingBodies($);

  return {
    mainText,
    mainTextLength: countChars(mainText),
    rawTextLength,
    readable,
    images,
    imagesWithoutAlt,
    scripts: $("script[src]").length,
    concreteSentences: specificity.concrete,
    totalSentences: specificity.total,
    mainHeadings: headingBodies.headings,
    headingsWithoutBody: headingBodies.withoutBody,
  };
}

export function checkContent(info: ContentInfo): CheckResult[] {
  const results: CheckResult[] = [];
  const len = info.mainTextLength;

  // --- JS レンダリング依存の検出 ------------------------------------------------
  // fetch した HTML にテキストがほとんど無く script が多い = SPA の可能性が高い。
  //
  // 問題があるときだけ出す作りだと、カテゴリの配点合計（= 分母）がページごとに
  // 変わり、レポートの「改善するとこうなる」の見込み加点が実際の伸びとずれる。
  // image-alt と同じく、該当しないページでは pass として必ず出す。
  const likelySpa = info.rawTextLength < 200 && info.scripts >= 3;
  results.push(
    check({
      id: "js-rendering",
      category: "content",
      status: likelySpa ? "fail" : "pass",
      weight: 3,
      label: likelySpa
        ? "HTML に本文がほとんど含まれていない（JS描画依存の可能性）"
        : "HTML の時点で本文が含まれている",
      evidence: `HTML内のテキスト ${info.rawTextLength} 文字 / 外部スクリプト ${info.scripts} 個`,
      advice:
        "取得した HTML にテキストがほぼ含まれておらず、JavaScript で描画されるページ（SPA）と思われます。多くの AI クローラは JavaScript を実行しないため、内容がまったく読まれない恐れがあります。サーバーサイドレンダリング（SSR）や静的生成（SSG）で、HTML の時点で本文が含まれるようにしてください。",
    }),
  );

  // --- 具体性 -----------------------------------------------------------------
  // 旧「本文量」（1,500 文字未満は減点）を置き換えたもの。理由は
  // measureSpecificity の上のコメントを参照。
  const concrete = info.concreteSentences;
  const sentences = info.totalSentences;
  const concreteRatio = sentences > 0 ? concrete / sentences : 0;
  // 文がほとんど無いページ（一覧・受付など）は fail にしない。
  // 文章はあるのに具体的な事実が 1 つも無いページだけを fail とする。
  const specificityStatus: CheckStatus =
    concrete === 0
      ? sentences >= 3
        ? "fail"
        : "warn"
      : concrete >= 2 && concreteRatio >= 0.1
        ? "pass"
        : "warn";
  results.push(
    check({
      id: "content-specificity",
      category: "content",
      status: specificityStatus,
      weight: 3,
      label:
        specificityStatus === "pass"
          ? "AI が引用できる具体的な情報がある"
          : specificityStatus === "warn"
            ? "具体的な情報がやや少ない"
            : "具体的な情報が見当たらない",
      evidence: `数値・日付・組織名・連絡先を含む文 ${concrete} / 全 ${sentences} 文`,
      advice:
        concrete === 0 && sentences < 3
          ? "このページには文章がほとんどありません。一覧や受付などの案内ページであればそのままで問題ありません。AI に引用させたい内容があるページなら、具体的な記述を加えてください。"
          : specificityStatus === "fail"
            ? "文章はありますが、数値・日付・料金・実績といった具体的な事実がほとんど含まれていません。AI 検索は「誰が・何を・いつ・どこで・いくらで」が書かれたページを引用します。文字数を増やすのではなく、いま書かれている説明に具体的な数字と固有名詞を加えてください。"
            : "具体的な事実を含む文が全体に対して少なめです。抽象的な説明を増やすのではなく、実績の件数・対応エリア・料金・所要期間など、確認できる事実を本文に足してください。",
    }),
  );

  // 文字数は参考として出すだけ。しきい値による減点はしない
  // （Google は推奨文字数を持たないと明言している）
  results.push(
    check({
      id: "content-length",
      category: "content",
      status: "info",
      label: "本文の分量（参考値）",
      evidence: `本文 約${len.toLocaleString()} 文字 / ${sentences} 文（空白・記号を除く）`,
    }),
  );

  // --- 見出しに中身が伴っているか -----------------------------------------------
  // 画像 alt と同じ理由で、見出しが 0 個のページでも必ず項目を出す
  // （配点の合計 = 分母をページ間で揃えるため）
  const emptyHeadingRatio =
    info.mainHeadings > 0 ? info.headingsWithoutBody / info.mainHeadings : 0;
  const headingBodyStatus: CheckStatus =
    emptyHeadingRatio === 0 ? "pass" : emptyHeadingRatio <= 0.5 ? "warn" : "fail";
  results.push(
    check({
      id: "content-heading-body",
      category: "content",
      status: headingBodyStatus,
      weight: 1,
      label:
        info.mainHeadings === 0
          ? "本文の見出しがないため、この項目の問題はない"
          : headingBodyStatus === "pass"
            ? "見出しに本文が伴っている"
            : "本文の無い見出しがある",
      evidence:
        info.mainHeadings === 0
          ? "本文領域に h2 / h3 がありません"
          : `h2 / h3 ${info.mainHeadings} 個のうち、直後に本文が無いもの ${info.headingsWithoutBody} 個`,
      advice:
        "見出しだけあって直後に説明が無いと、AI は「その見出しの問いに対する答え」を取り出せません。見出しの直下に、その見出しに答える文を 1〜2 文置いてください。",
    }),
  );

  // --- 画像 alt ---------------------------------------------------------------
  // 画像が 0 枚のページでもこの項目は必ず出す。条件付きで省くとカテゴリの満点
  // （配点の合計 = 分母）がページごとに変わってしまい、本文量が同じでも
  // 「画像があるページ」と「画像がないページ」でスコアがずれる。
  // 画像が無いページは alt の問題が存在しないので pass 扱いにする。
  const ratio = info.images > 0 ? info.imagesWithoutAlt / info.images : 0;
  const altStatus = ratio === 0 ? "pass" : ratio <= 0.3 ? "warn" : "fail";
  results.push(
    check({
      id: "image-alt",
      category: "content",
      status: altStatus,
      weight: 1,
      label:
        info.images === 0
          ? "画像がないため alt の問題はない"
          : altStatus === "pass"
            ? "画像に alt 属性が設定されている"
            : "alt 属性のない画像がある",
      evidence:
        info.images === 0
          ? "画像 0 枚"
          : `画像 ${info.images} 枚のうち alt なし ${info.imagesWithoutAlt} 枚`,
      advice:
        "alt 属性は画像の内容を文字で説明するものです。AI は画像そのものより alt テキストから内容を読み取るため、装飾以外の画像には「何が写っているか」を短く記述してください。",
    }),
  );

  return results;
}
