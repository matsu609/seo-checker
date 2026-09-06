import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { check } from "./check";
import type { CheckResult } from "./types";

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
}

/** 空白を潰し、長さの比較に使える形へ */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 文字数として数える単位: 空白と記号を除いた長さ */
export function countChars(text: string): number {
  return normalizeText(text).replace(/[\s\p{P}\p{S}]/gu, "").length;
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

  // Readability が本文の大半を捨ててしまうケース（会社概要のような表組みページ）では
  // フォールバックの方が実態に近い。極端に短い場合はフォールバックを採用する
  if (!readable || mainText.length < Math.min(300, fallback.length * 0.3)) {
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

  return {
    mainText,
    mainTextLength: countChars(mainText),
    rawTextLength,
    readable,
    images,
    imagesWithoutAlt,
    scripts: $("script[src]").length,
  };
}

export function checkContent(info: ContentInfo): CheckResult[] {
  const results: CheckResult[] = [];
  const len = info.mainTextLength;

  // --- JS レンダリング依存の検出 ------------------------------------------------
  // fetch した HTML にテキストがほとんど無く script が多い = SPA の可能性が高い
  const likelySpa = info.rawTextLength < 200 && info.scripts >= 3;
  if (likelySpa) {
    results.push(
      check({
        id: "js-rendering",
        category: "content",
        status: "fail",
        weight: 3,
        label: "HTML に本文がほとんど含まれていない（JS描画依存の可能性）",
        evidence: `HTML内のテキスト ${info.rawTextLength} 文字 / 外部スクリプト ${info.scripts} 個`,
        advice:
          "取得した HTML にテキストがほぼ含まれておらず、JavaScript で描画されるページ（SPA）と思われます。多くの AI クローラは JavaScript を実行しないため、内容がまったく読まれない恐れがあります。サーバーサイドレンダリング（SSR）や静的生成（SSG）で、HTML の時点で本文が含まれるようにしてください。",
      }),
    );
  }

  // --- 本文量 -----------------------------------------------------------------
  const status = len >= 1500 ? "pass" : len >= 500 ? "warn" : "fail";
  results.push(
    check({
      id: "content-length",
      category: "content",
      status,
      weight: 3,
      label:
        status === "pass"
          ? "本文の情報量が十分ある"
          : status === "warn"
            ? "本文の情報量がやや少ない"
            : "本文の情報量が不足している",
      evidence: `本文 約${len.toLocaleString()} 文字（空白・記号を除く）`,
      advice:
        status === "warn"
          ? "本文が 1,500 文字未満です。AI 検索は具体的な情報（誰が・何を・いつ・どこで・いくらで）が揃ったページを引用しやすいため、サービス内容・実績・よくある質問などを加えて情報量を増やしてください。"
          : "本文が 500 文字未満で、AI が引用できる情報がほとんどありません。ページの目的に沿った説明文を最低でも 1,000 文字以上、できれば 1,500 文字以上になるよう書き足してください。",
    }),
  );

  // --- 画像 alt ---------------------------------------------------------------
  if (info.images > 0) {
    const ratio = info.imagesWithoutAlt / info.images;
    const altStatus = ratio === 0 ? "pass" : ratio <= 0.3 ? "warn" : "fail";
    results.push(
      check({
        id: "image-alt",
        category: "content",
        status: altStatus,
        weight: 1,
        label:
          altStatus === "pass"
            ? "画像に alt 属性が設定されている"
            : "alt 属性のない画像がある",
        evidence: `画像 ${info.images} 枚のうち alt なし ${info.imagesWithoutAlt} 枚`,
        advice:
          "alt 属性は画像の内容を文字で説明するものです。AI は画像そのものより alt テキストから内容を読み取るため、装飾以外の画像には「何が写っているか」を短く記述してください。",
      }),
    );
  }

  return results;
}
