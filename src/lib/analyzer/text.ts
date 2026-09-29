/**
 * 文字列の小さな道具。content.ts と sentences.ts の両方から使うため、
 * 循環 import にならないようここに置く（content.ts からも再 export している）。
 */

/** 空白を潰し、長さの比較に使える形へ */
export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** 文字数として数える単位: 空白と記号を除いた長さ */
export function countChars(text: string): number {
  return normalizeText(text).replace(/[\s\p{P}\p{S}]/gu, "").length;
}

/** 文字・数字を 1 つも含まない断片（「—」「・」だけのセルなど）は文として数えない */
export function hasWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

/** レポートに載せる実例を、読める長さに切り詰める */
export function clip(text: string, max: number): string {
  const clean = normalizeText(text);
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

/**
 * 表示幅。日本語は 1 文字あたりの情報量が多いので、全角文字（U+2E80 以降）を 2 幅として数える。
 * クイック診断（meta.ts）・サイト診断（audit/parse.ts）・ページ診断（page-report/extract.ts）で
 * 同じ数え方をするため、ここに 1 つだけ置く（2026-09-23 に 3 か所の複製をまとめた）。
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    width += code > 0x2e7f ? 2 : 1;
  }
  return width;
}

/** 全角換算の文字数（表示用）。displayWidth の半分を切り上げる */
export function fullWidthCount(text: string): number {
  return Math.ceil(displayWidth(text) / 2);
}

/** URL のオリジン。読めなければ空文字 */
export function safeOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}
