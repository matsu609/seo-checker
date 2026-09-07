/**
 * Markdown まわりの純関数（クライアントでも使う）。
 *
 * 記事は Markdown で保持し、書き出しは Markdown / HTML / クリップボード。
 * 外部ライブラリを増やさないため、見出し・箇条書き・強調・リンク・コード・
 * 引用・区切り線だけを扱う小さな変換にとどめる（記事本文には十分）。
 */
import type { ArticleOutline } from "./types";

/** 空白を潰す（analyzer の normalizeText と同じ数え方に合わせる） */
function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * 文字数（空白と記号を除く）。
 * 無料診断の countChars と同じ数え方だが、cheerio 等を引き込まないよう
 * ここに小さく持つ（クライアントのバンドルに入れるため）。
 */
export function countChars(text: string): number {
  return normalizeText(text).replace(/[\s\p{P}\p{S}]/gu, "").length;
}

/** Markdown の記法を落として素のテキストにする（チェック機能の入力） */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^[ \t]{0,3}[-*+][ \t]+/gm, "")
    .replace(/^[ \t]{0,3}\d+\.[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}(?:-{3,}|\*{3,})[ \t]*$/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** 構成案 → 見出しだけの Markdown（本文生成前のプレビュー・下書きの初期値） */
export function outlineToMarkdown(outline: ArticleOutline, title?: string): string {
  const lines: string[] = [];
  const heading = title?.trim() || outline.title_suggestions[0];
  if (heading) lines.push(`# ${heading}`, "");
  for (const section of outline.outline) {
    lines.push(`## ${section.h2}`, "");
    for (const h3 of section.h3) lines.push(`### ${h3}`, "");
  }
  return lines.join("\n").trimEnd();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 行内の強調・リンク・コード（エスケープ後に適用する） */
function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
}

/**
 * 記事の Markdown を HTML に変換する（書き出し用）。
 * 生の HTML は出力しない（すべてエスケープしてから記法を適用する）。
 */
export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const closeParagraph = () => {
    if (paragraph.length > 0) {
      out.push(`<p>${inline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };

  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }
    const heading = /^(#{1,6})[ \t]+(.*)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      continue;
    }
    if (/^[ \t]{0,3}(?:-{3,}|\*{3,})[ \t]*$/.test(line)) {
      closeParagraph();
      closeList();
      out.push("<hr />");
      continue;
    }
    const quote = /^[ \t]{0,3}>[ \t]?(.*)$/.exec(line);
    if (quote) {
      closeParagraph();
      closeList();
      out.push(`<blockquote><p>${inline(quote[1])}</p></blockquote>`);
      continue;
    }
    const ul = /^[ \t]{0,3}[-*+][ \t]+(.*)$/.exec(line);
    if (ul) {
      closeParagraph();
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = /^[ \t]{0,3}\d+\.[ \t]+(.*)$/.exec(line);
    if (ol) {
      closeParagraph();
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    closeList();
    paragraph.push(line.trim());
  }
  closeParagraph();
  closeList();
  return out.join("\n");
}

/** 書き出す HTML ファイルの中身（単体で開ける最小限の文書） */
export function toHtmlDocument(markdown: string, title: string): string {
  return [
    "<!doctype html>",
    '<html lang="ja">',
    "<head>",
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(title)}</title>`,
    "</head>",
    "<body>",
    markdownToHtml(markdown),
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

/** 本文中から該当箇所を探す（チェック結果の強調表示用）。見つからなければ null */
export function findSpan(text: string, needle: string): number | null {
  const target = needle.trim();
  if (!target) return null;
  const direct = text.indexOf(target);
  if (direct >= 0) return direct;
  // 空白・改行の違いを吸収してもう一度探す
  const loose = target.replace(/\s+/g, "");
  if (!loose) return null;
  let compact = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    if (/\s/.test(text[i])) continue;
    compact += text[i];
    map.push(i);
  }
  const at = compact.indexOf(loose);
  return at >= 0 ? map[at] : null;
}
