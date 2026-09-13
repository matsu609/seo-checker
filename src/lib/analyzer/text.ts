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
