/**
 * いまのページに FAQ が入っているかを機械的に確かめる（純関数。ネットワークに出ない）。
 *
 * ここで出すのは**事実だけ**で、直し方は書かない（利用者の決定 2026-09-22:
 * 「SEO・AIO は事実の提示と改善案の提示まで」。提示の前半がこのファイル）。
 *
 * AI 検索が FAQ を引用する条件は 2 つそろうこと:
 *   1. 画面に質問と答えが対で見えている（本文。ChatGPT / Gemini はここを読む）
 *   2. 構造化データ（FAQPage の JSON-LD）でその対応が明示されている（検索エンジンはここを読む）
 * どちらか片方だけでは弱く、**構造化データにしかない FAQ は Google のガイドライン違反**
 * （画面に見えない内容をマークアップしてはいけない）なので、食い違いは必ず拾う。
 */
import * as cheerio from "cheerio";

export type FaqFindingStatus = "ok" | "warn" | "fail";

export interface FaqFinding {
  id: string;
  /** 確かめたこと */
  label: string;
  status: FaqFindingStatus;
  /** 測った値と、そう判定した理由 */
  detail: string;
}

export interface FaqAudit {
  /** 構造化データ（FAQPage）の状態 */
  jsonLd: {
    present: boolean;
    /** FAQPage に入っている質問文 */
    questions: readonly string[];
    /** JSON として読めなかった script の数 */
    brokenBlocks: number;
  };
  /** 画面に見えている FAQ の状態 */
  visible: {
    /** 「よくある質問」などの見出し */
    headings: readonly string[];
    /** details / summary の折りたたみの数 */
    detailsCount: number;
    /** 質問の形をした見出し（「〜ですか？」「Q. 〜」） */
    questionHeadings: readonly string[];
  };
  /** 構造化データにあるのに画面の文章に見当たらない質問（ガイドライン違反） */
  hiddenQuestions: readonly string[];
  /** すでにページにある質問（提案で重複させないために AI へ渡す） */
  existingQuestions: readonly string[];
  findings: readonly FaqFinding[];
}

/** 「よくある質問」の見出しとみなす語 */
const FAQ_HEADING_WORDS = ["よくある質問", "よくあるご質問", "よく頂く質問", "よくいただく質問", "faq", "q&a", "q＆a", "質問と回答"];

/** 質問の形をした行か（末尾が ? / ？、または Q. で始まる） */
function looksLikeQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[?？]\s*$/.test(t)) return true;
  return /^(q\s*[.:．：]|q\d|Ｑ)/i.test(t);
}

/** 比較用に文字を寄せる（全角半角・空白・大文字小文字の違いで取りこぼさない） */
export function normalizeForMatch(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/** JSON-LD を 1 つずつ平らにする（@graph・配列・入れ子をすべて展開する） */
function flatten(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) flatten(item, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  out.push(obj);
  if ("@graph" in obj) flatten(obj["@graph"], out);
  if ("mainEntity" in obj) flatten(obj.mainEntity, out);
  if ("itemListElement" in obj) flatten(obj.itemListElement, out);
}

function typesOf(obj: Record<string, unknown>): string[] {
  const raw = obj["@type"];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  return [];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const name = (value as Record<string, unknown>).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

/** HTML タグを落として文字列にする（回答文が HTML で書かれていることがある） */
function stripTags(text: string): string {
  return text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * ページの HTML から FAQ の状態を読み取る。
 * 取得も採点もしない（このサービスは FAQ に点数を付けない。付けると「何点なら合格か」の
 * 話になり、入れるべき質問が決まらないため）。
 */
export function auditFaq(html: string): FaqAudit {
  const $ = cheerio.load(html);

  // --- 構造化データ ---
  const jsonLdQuestions: string[] = [];
  let brokenBlocks = 0;
  let hasFaqPage = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      brokenBlocks += 1;
      return;
    }
    const nodes: Record<string, unknown>[] = [];
    flatten(data, nodes);
    if (nodes.some((n) => typesOf(n).includes("FAQPage"))) hasFaqPage = true;
    for (const node of nodes) {
      if (!typesOf(node).includes("Question")) continue;
      const name = stripTags(textOf(node.name));
      if (name) jsonLdQuestions.push(name);
    }
  });

  // --- 画面に見えている FAQ ---
  // script / style / noscript は画面に出ないので、見えている文章から外す
  $("script, style, noscript, template").remove();
  const pageText = normalizeForMatch($("body").text() || $.root().text());

  const headings: string[] = [];
  const questionHeadings: string[] = [];
  $("h1, h2, h3, h4, h5, h6, summary, dt").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    const flat = normalizeForMatch(text);
    if (FAQ_HEADING_WORDS.some((w) => flat.includes(normalizeForMatch(w)))) headings.push(text);
    if (looksLikeQuestion(text)) questionHeadings.push(text);
  });
  const detailsCount = $("details").length;

  const hiddenQuestions = jsonLdQuestions.filter((q) => !pageText.includes(normalizeForMatch(q)));

  const existing = new Map<string, string>();
  for (const q of [...jsonLdQuestions, ...questionHeadings]) {
    const key = normalizeForMatch(q);
    if (key && !existing.has(key)) existing.set(key, q);
  }

  const visibleCount = Math.max(detailsCount, questionHeadings.length);
  const findings: FaqFinding[] = [
    {
      id: "jsonld",
      label: "FAQ の構造化データ（FAQPage）",
      status: hasFaqPage ? "ok" : "fail",
      detail: hasFaqPage
        ? `FAQPage が入っています（質問 ${jsonLdQuestions.length} 件）。検索エンジンは質問と答えの対応をそのまま読めます`
        : "FAQPage が入っていません。検索エンジンと AI は、どこからどこまでが質問と答えの対なのかを本文から推測することになります",
    },
    {
      id: "visible",
      label: "画面に見えている FAQ",
      status: visibleCount > 0 ? "ok" : "fail",
      detail:
        visibleCount > 0
          ? `質問の形をした見出し ${questionHeadings.length} 件、折りたたみ（details）${detailsCount} 件が見つかりました`
          : "質問と答えの対が画面に見当たりません。AI 検索が引用するのは画面に書かれている文章です",
    },
    {
      id: "heading",
      label: "「よくある質問」の見出し",
      status: headings.length > 0 ? "ok" : "warn",
      detail:
        headings.length > 0
          ? `見出しがあります（${headings.slice(0, 3).join(" / ")}）。AI はここをひとまとまりの FAQ として扱えます`
          : "「よくある質問」などの見出しが見当たりません。質問が本文に散らばっていると、AI はまとめて読み取れません",
    },
    {
      id: "match",
      label: "構造化データと画面の一致",
      status: hiddenQuestions.length > 0 ? "fail" : hasFaqPage ? "ok" : "warn",
      detail:
        hiddenQuestions.length > 0
          ? `構造化データにあるのに画面に見当たらない質問が ${hiddenQuestions.length} 件あります（${hiddenQuestions.slice(0, 2).join(" / ")}）。画面に見えない内容のマークアップは Google のガイドライン違反です`
          : hasFaqPage
            ? "構造化データの質問は、すべて画面の文章にも見つかりました"
            : "構造化データが無いため、比べる対象がありません",
    },
    {
      id: "broken",
      label: "構造化データの書式",
      status: brokenBlocks > 0 ? "fail" : "ok",
      detail:
        brokenBlocks > 0
          ? `JSON として読めない構造化データが ${brokenBlocks} 件あります。この中の FAQ は検索エンジンにも届いていません`
          : "構造化データはすべて JSON として読めました",
    },
  ];

  return {
    jsonLd: { present: hasFaqPage, questions: jsonLdQuestions, brokenBlocks },
    visible: { headings, detailsCount, questionHeadings },
    hiddenQuestions,
    existingQuestions: [...existing.values()],
    findings,
  };
}
