/**
 * トップページの title からサイト名（ブランド名）を推測する。精密診断のブランド名検索
 * （seo-analysis/search.ts）と llms.txt のサイト名（llms-txt/scan.ts）で共有する。
 *
 * 2026-09-23 に 1 つのルールへまとめた。以前は精密診断が区切りの**最後**、llms.txt が
 * **最初**の要素を採っていて、同じサイトで別の名前になっていた。どちらか一方の位置に
 * 決め打ちすると、トップページの title は「サイト名｜キャッチコピー」と
 * 「キーワード｜サイト名」（キーワードを前に置く SEO の定石）の両方があるため、
 * 半分のサイトでキャッチコピーをブランド名として検索してしまう。そこで次の順に決める。
 *
 *   1. 下層ページの title に繰り返し出てくる要素（下層は「ページ名｜サイト名」が定石で、
 *      サイト名だけがページをまたいで共通になる。いちばん確かな手がかり）
 *   2. 会社・店舗の名前らしい要素（株式会社・クリニック・歯科 など）
 *   3. どちらでも決まらなければ最初の要素（トップページは「サイト名｜キャッチコピー」が多い）
 */

/** 名前として採る長さの上限（これより長い要素はキャッチコピーとみなす） */
export const MAX_SITE_NAME_LENGTH = 30;

/**
 * title を区切りで分ける。`|` `｜` `–` `—` `：` はどこでも区切り、半角の `-` `:` は前後に空白が
 * あるときだけ区切る（`e-Tax` や `Wi-Fi` のような名前の中のハイフンで割らない）。
 */
export function splitTitle(title: string): string[] {
  return title
    .split(/\s*[|｜–—：]\s*|\s+[-:]\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 会社・店舗・事業者の名前らしい語 */
const ORGANIZATION_WORDS =
  /株式会社|有限会社|合同会社|合資会社|一般社団法人|公益社団法人|社会福祉法人|医療法人|学校法人|NPO法人|（株）|\(株\)|（有）|\(有\)|事務所|クリニック|歯科|医院|病院|整骨院|接骨院|治療院|工務店|商店|本舗|サロン|\bInc\.?|\bLLC\b|Co\.,?\s*Ltd|Corporation|\bCorp\.?/i;

/** 比較用に寄せる（全角半角・空白・大文字小文字の違いを無視） */
function keyOf(text: string): string {
  return text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

/**
 * サイト名を推測する。決められなければ空文字。
 * `otherTitles` には同じサイトの下層ページの title を渡す（無くても動く）。
 */
export function guessSiteName(homeTitle: string | null | undefined, otherTitles: readonly string[] = []): string {
  if (!homeTitle) return "";
  const parts = splitTitle(homeTitle).filter((p) => p.length <= MAX_SITE_NAME_LENGTH);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];

  // 1. 下層ページの title の要素として何回出てくるか
  const counts = new Map<string, number>();
  for (const title of otherTitles) {
    const keys = new Set(splitTitle(title).map(keyOf));
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best: { part: string; count: number } | null = null;
  for (const part of parts) {
    const count = counts.get(keyOf(part)) ?? 0;
    if (count > 0 && (!best || count > best.count)) best = { part, count };
  }
  if (best) return best.part;

  // 2. 会社・店舗の名前らしい要素
  const named = parts.find((p) => ORGANIZATION_WORDS.test(p));
  if (named) return named;

  // 3. 最初の要素
  return parts[0];
}
