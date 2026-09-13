/**
 * 文の切り出しと「具体的な事実を含む文」の判定（多言語）。
 *
 * 以前の実装は本文を 1 本の文字列にしてから句点（。）で割っていた。そのため
 *   - 句点を持たない言語（英語など）のページは、本文全体が常に 1 文になる
 *   - 箇条書き・表だけのページも、句読点が無いので 1 文になる
 * という数え方になり、本文を増やしても「1 / 全 1 文」から動かなかった。
 *
 * ここでは
 *   1. HTML をブロック（段落・リスト項目・表のセル・見出し）に分ける
 *   2. ブロックごとに言語を判定する（lang 属性 → 文字種）
 *   3. 言語に合った区切り方で文に割る（日本語は 。！？ / 英語などは . ! ? ＋空白）
 *   4. 文ごとに、数値・日付・組織名・連絡先などの事実が含まれるかを見る
 * という順で数える。リスト項目・表のセル・見出しは句読点が無くても 1 文として数える。
 */
import * as cheerio from "cheerio";
import type { AnyNode, Element, Text } from "domhandler";
import {
  detectLanguage,
  documentLanguage,
  isCjkChar,
  type LanguageInfo,
  type SentenceStyle,
} from "./language";
import { clip, hasWords, normalizeText } from "./text";

/* ─────────────────────────── ブロック分け ─────────────────────────── */

/** 中に文を持てる入れ物。ここで切っても本文の量は変わらない */
const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "caption", "dd", "details", "dialog", "div", "dl",
  "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "legend", "li", "main", "nav", "ol", "option", "p", "pre", "section",
  "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

/**
 * 句読点が無くても、それぞれ 1 文として数える単位。
 * 箇条書きや表だけのページ（「対応エリア: 東京都」のような行が 20 個）を
 * 「全 1 文」と数えないための決まり。
 */
const STANDALONE_TAGS = new Set([
  "li", "td", "th", "dt", "dd", "h1", "h2", "h3", "h4", "h5", "h6", "caption", "figcaption",
  "summary", "option", "legend",
]);

export interface TextBlock {
  /** 空白を潰した本文 */
  text: string;
  /** 最も近い祖先（自分を含む）の lang 属性。無ければ null */
  lang: string | null;
  /** リスト項目・表のセル・見出しか（句読点が無くても 1 文として数える） */
  standalone: boolean;
}

function childrenOf(node: AnyNode): AnyNode[] {
  return "children" in node && Array.isArray(node.children) ? (node.children as AnyNode[]) : [];
}

function tagNameOf(node: AnyNode): string {
  return node.type === "tag" ? (node as Element).name.toLowerCase() : "";
}

/**
 * ブロックを拾いながら、まだ文になっていないインライン部分（span / a / strong など）を返す。
 * ブロック要素にぶつかったら、そこまでの地の文を 1 ブロックとして確定させる。
 */
function walk(node: AnyNode, inheritedLang: string | null, out: TextBlock[]): string {
  if (node.type === "text") return (node as Text).data ?? "";
  if (node.type !== "tag" && node.type !== "root") return "";

  const tag = tagNameOf(node);
  const attrLang = node.type === "tag" ? (node as Element).attribs?.lang?.trim() : "";
  const lang = attrLang ? attrLang : inheritedLang;
  const isBlock = tag === "" || BLOCK_TAGS.has(tag);
  let pending = "";

  const flush = () => {
    const text = normalizeText(pending);
    pending = "";
    if (text && hasWords(text)) {
      out.push({ text, lang, standalone: STANDALONE_TAGS.has(tag) });
    }
  };

  for (const child of childrenOf(node)) {
    const childTag = tagNameOf(child);
    if (childTag === "br") {
      // 改行は段落の切れ目として扱う（<br> で 1 行ずつ書かれた住所・営業時間）
      if (isBlock) flush();
      else pending += " ";
      continue;
    }
    if (childTag && BLOCK_TAGS.has(childTag)) {
      if (isBlock) flush(); // ブロックの前に置かれた地の文を先に確定する
      walk(child, lang, out);
      continue;
    }
    pending += walk(child, lang, out);
  }

  if (isBlock) {
    flush();
    return "";
  }
  return pending;
}

/**
 * HTML をブロックに分ける。
 * 渡された $ は書き換える（script 等を取り除く）ので、使い捨ての複製を渡すこと。
 */
export function extractBlocks($: cheerio.CheerioAPI): TextBlock[] {
  $("script, style, noscript, template, svg, iframe").remove();
  const blocks: TextBlock[] = [];
  const root = $("body")[0] ?? $.root()[0];
  if (root) walk(root, null, blocks);
  return blocks;
}

/* ─────────────────────────── 文に割る ─────────────────────────── */

/** 空白が無くても必ず文の切れ目になる記号 */
const HARD_TERMINATORS = new Set(["。", "！", "？"]);
/** 空白・行末（または直後が日本語の文字）のときだけ切れ目になる記号 */
const SOFT_TERMINATORS = new Set([".", "．", "!", "?", "…"]);
/** 文末の記号のあとに続く閉じ記号は、その文に含める */
const CLOSERS = new Set(['"', "'", "”", "’", ")", "）", "]", "］", "」", "』", "》", "»"]);

/**
 * 英語で、直後のピリオドが文末ではない語。
 * 略語（Inc. / Ltd. / No. / Mr.）・月名の短縮形・曜日など。
 * 1 文字の語（イニシャル）とピリオドを含む語（e.g. / U.S. / A.I.）は下の判定で別に拾う。
 */
const ABBREVIATIONS = new Set([
  "inc", "ltd", "co", "corp", "llc", "llp", "plc", "gmbh", "pte", "pty", "ste", "dept", "div",
  "mr", "mrs", "ms", "mx", "dr", "prof", "rev", "hon", "st", "jr", "sr", "esq",
  "vs", "etc", "et al", "al", "ca", "cf", "approx", "est", "fig", "figs", "no", "nos", "vol",
  "vols", "ed", "eds", "pp", "ref", "sec", "min", "max", "avg", "am", "pm", "tel", "fax", "ext",
  "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec",
  "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun",
]);

/**
 * URL・メールアドレス。中のピリオドで文を切らないよう、同じ長さの伏せ字に置き換えてから
 * 区切り位置を探す（文字数が変わらないので、元の文字列から切り出せる）。
 * 末尾が句読点で終わらないようにして、文末のピリオドまで飲み込まないようにする。
 */
const RE_PROTECTED =
  /(?:https?:\/\/|www\.)[^\s<>"'）】]*[^\s<>"'.,;:!?)）】\]]|[\w.+-]+@[\w-]+\.[\w-]+(?:\.[\w-]+)*/gi;

function maskProtected(text: string): string {
  return text.replace(RE_PROTECTED, (match) => "x".repeat(match.length));
}

/** ピリオドの直前が略語・頭字語・イニシャルか */
function endsWithAbbreviation(before: string): boolean {
  const matched = /([\p{L}][\p{L}.'&-]*)$/u.exec(before);
  if (!matched) return false;
  const word = matched[1].toLowerCase().replace(/[^\p{L}.]/gu, "");
  if (word.length <= 1) return true; // イニシャル（J. Smith）
  if (word.includes(".")) return true; // 頭字語（U.S. / e.g. / A.I.）
  return ABBREVIATIONS.has(word);
}

/**
 * 箇条書きの番号（"1." "12."）か。ブロックの先頭が数字だけのときに限る。
 * 文の途中の "…in 2019. Next…" まで番号扱いにしてしまわないよう、先頭に限定する。
 */
function endsWithListNumber(before: string): boolean {
  return /^[\s(（[［]*\d+$/.test(before);
}

/**
 * 文に割る。`style` は言語の系統（日本語などの `cjk` / 英語などの `latin`）。
 * 区切り記号は文に含めたまま返す。
 */
export function splitSentences(text: string, style: SentenceStyle = "cjk"): string[] {
  const clean = normalizeText(text);
  if (!clean) return [];
  const scan = maskProtected(clean);
  const out: string[] = [];
  let start = 0;

  for (let i = 0; i < scan.length; i += 1) {
    const ch = scan[i];
    if (!HARD_TERMINATORS.has(ch) && !SOFT_TERMINATORS.has(ch)) continue;

    // 連続する記号（"..." "!?"）はまとめて 1 つの切れ目とみなす
    let end = i;
    while (end + 1 < scan.length && (HARD_TERMINATORS.has(scan[end + 1]) || SOFT_TERMINATORS.has(scan[end + 1]))) {
      end += 1;
    }
    let stop = end;
    while (stop + 1 < scan.length && CLOSERS.has(scan[stop + 1])) stop += 1;

    if (isBoundary(scan, i, end, stop, style)) {
      const piece = clean.slice(start, stop + 1).trim();
      if (piece) out.push(piece);
      start = stop + 1;
    }
    i = stop;
  }

  const rest = clean.slice(start).trim();
  if (rest) out.push(rest);
  return out.filter(hasWords);
}

function isBoundary(
  scan: string,
  runStart: number,
  runEnd: number,
  stop: number,
  style: SentenceStyle,
): boolean {
  const run = scan.slice(runStart, runEnd + 1);
  if ([...run].some((c) => HARD_TERMINATORS.has(c))) return true;

  const after = scan[stop + 1];
  const breakAfter = after === undefined || after === " ";
  const cjkAfter = after !== undefined && isCjkChar(after);
  // "example.com" "Yahoo!JAPAN" "1.5" のように語の途中なら切らない
  if (!breakAfter && !cjkAfter) return false;

  const dotsOnly = /^[.．]+$/.test(run);
  if (!dotsOnly) return true; // ! ? … は空白・行末が続けば文末

  // ピリオドは誤爆しやすいので条件を足す
  if (style === "cjk" && !cjkAfter) return false; // 日本語のブロックの "e.g. " では切らない
  const before = scan.slice(0, runStart);
  if (endsWithAbbreviation(before)) return false;
  if (endsWithListNumber(before)) return false;
  return true;
}

/** 言語を文字種から推定して文に割る（HTML が無く、文字列しか無いとき用） */
export function splitTextSentences(text: string, htmlLang?: string | null): string[] {
  return splitSentences(text, documentLanguage(htmlLang ?? null, text).style);
}

/* ─────────────────── 具体的な事実を含む文の判定 ─────────────────── */

/** 英語などの単位。数字に続くものだけを見る */
const UNITS_LATIN = [
  "%", "percent", "people", "persons?", "customers?", "clients?", "users?", "members?", "guests?",
  "employees?", "staff", "stores?", "shops?", "locations?", "branches", "offices?", "countries",
  "cities", "projects?", "cases?", "items?", "products?", "reviews?", "seats?", "rooms?", "units?",
  "years?", "months?", "weeks?", "days?", "hours?", "hrs?", "minutes?", "mins?", "seconds?",
  "million", "billion", "thousand", "times", "points?", "degrees?",
  "km", "kilometers?", "miles?", "meters?", "m2", "sqm", "m", "cm", "mm", "kg", "g", "t", "tons?",
  "l", "ml", "mb", "gb", "tb", "kw", "kwh",
].join("|");

const MONTHS_LATIN =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec";

/**
 * 「AI が引用できる事実」を含む文かどうかを見る手がかり。
 * 全角数字・全角記号・㈱ などは NFKC で半角に揃えてから当てるので、ここは半角だけ書く。
 */
const CONCRETE_PATTERNS: RegExp[] = [
  // 数量（日本語の助数詞。"3,000 円" "50 名" "12 か月"）
  /\d[\d,]*(?:\.\d+)?\s*(?:円|万円|億円|%|人|名|社|店舗|件|個|台|回|点|種|品|室|席|階|坪|畳|平方メートル|年|ヶ月|か月|カ月|箇月|月|日|週|時間|分|秒|歳|才|位|倍|割|周年|以上|以下|未満)/,
  // 数量（英語などの単位。"50 stores" "1,200 people" "3.5 km" "20%"）
  new RegExp(`\\d[\\d,]*(?:\\.\\d+)?\\s*(?:${UNITS_LATIN})\\b`, "i"),
  // 通貨（"¥9,800" "$100" "9,800 yen" "JPY 9,800"）
  /[$¥€£]\s?\d|\d[\d,.]*\s*(?:yen|jpy|usd|eur|gbp)\b|\b(?:jpy|usd|eur|gbp)\s*\d/i,
  // 日付・年（和暦・西暦・ISO）
  /\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*日|令和\s*\d+|平成\s*\d+|\d{4}[-/]\d{1,2}[-/]\d{1,2}/,
  // 日付・年（英語表記。"November 6, 2024" "6 Nov" "founded in 2024"）
  new RegExp(
    `\\b(?:${MONTHS_LATIN})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS_LATIN})\\b|\\b(?:19|20)\\d{2}\\b`,
    "i",
  ),
  // 組織・法人格（日本語）
  /株式会社|有限会社|合同会社|合資会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|NPO法人|独立行政法人|学校法人|医療法人|社会福祉法人|\(株\)|\(有\)/,
  // 組織・法人格（英語など）
  /\b(?:Inc|Ltd|LLC|LLP|PLC|Corp|GmbH|Pte|Pty|K\.K|S\.A|B\.V|N\.V)\b\.?|\bCo\.,?\s*Ltd\b|\bCorporation\b|\bIncorporated\b/i,
  // 連絡先・所在地・時刻（郵便番号・電話番号・受付時間）
  /〒\s*\d{3}|\b\d{3}-\d{4}\b|\d{2,4}-\d{2,4}-\d{4}|\+\d{1,3}[-\s]?\d{1,4}[-\s]?\d{3,4}|\(\d{3}\)\s*\d{3}-\d{4}|\d{1,2}:\d{2}|電話番号|\bTEL\b|\bFAX\b/i,
  // メールアドレス・URL
  /[\w.+-]+@[\w-]+\.[a-z]{2,}|https?:\/\/|\bwww\.[\w-]+\.[a-z]{2,}/i,
  // 識別番号（法人番号・許可番号など。6 桁以上の数字）
  /\b\d{6,}\b/,
];

/** 数値・日付・組織名・連絡先などの事実を含む文か */
export function isConcrete(sentence: string): boolean {
  const normalized = sentence.normalize("NFKC");
  return CONCRETE_PATTERNS.some((re) => re.test(normalized));
}

/* ─────────────────────────── 集計 ─────────────────────────── */

/** レポートに載せる実例の数と長さ */
const MAX_EXAMPLES = 3;
const EXAMPLE_CHARS = 90;

export interface Specificity {
  /** 事実を含む文の数 */
  concrete: number;
  /** 文の総数 */
  total: number;
  /** 判定に使った言語（文の数がいちばん多かったもの） */
  language: LanguageInfo;
  /** 事実を含むと判定した文の実例（先頭から最大 3 件） */
  examples: string[];
  /** 事実が 1 件も無かったときに「何を文として数えたか」を示す実例（先頭から最大 3 件） */
  samples: string[];
}

/** ブロックごとに言語を見て文に割り、事実を含む文を数える */
export function measureSpecificity(blocks: TextBlock[], docLang: LanguageInfo): Specificity {
  let concrete = 0;
  let total = 0;
  const examples: string[] = [];
  const samples: string[] = [];
  const counts = new Map<string, { info: LanguageInfo; sentences: number }>();

  for (const block of blocks) {
    const language = detectLanguage(block.text, block.lang, docLang);
    const split = splitSentences(block.text, language.style);
    // リスト項目・表のセル・見出しは、句読点が無くてもそれぞれ 1 文として数える
    const sentences = split.length > 0 ? split : block.standalone ? [block.text] : [];
    if (sentences.length === 0) continue;

    const entry = counts.get(language.code) ?? { info: language, sentences: 0 };
    entry.sentences += sentences.length;
    counts.set(language.code, entry);

    for (const sentence of sentences) {
      total += 1;
      // 実例は同じ文を並べても情報が増えないので、重複は取らない
      const short = clip(sentence, EXAMPLE_CHARS);
      if (samples.length < MAX_EXAMPLES && !samples.includes(short)) samples.push(short);
      if (!isConcrete(sentence)) continue;
      concrete += 1;
      if (examples.length < MAX_EXAMPLES && !examples.includes(short)) examples.push(short);
    }
  }

  let language = docLang;
  let most = 0;
  for (const entry of counts.values()) {
    if (entry.sentences > most) {
      most = entry.sentences;
      language = entry.info;
    }
  }
  return { concrete, total, language, examples, samples };
}
