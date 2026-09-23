/**
 * JSON-LD を読むときの共通の道具（2026-09-23 に 3 か所の複製をまとめた）。
 * クイック診断（jsonld.ts）・サイト診断（audit/extras.ts）・ページ診断（page-report/extract.ts）・
 * FAQ ツール（faq/audit.ts）が同じ辿り方・同じ @type の読み方をする。
 */

export type JsonObject = Record<string, unknown>;

/**
 * JSON-LD のすべてのオブジェクトを深さ優先で訪ねる。
 * `@graph` 配列・`mainEntity`・`hasPart` などの入れ子や配列を区別せずに辿る。
 */
export function walkJsonLd(node: unknown, visit: (obj: JsonObject) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) walkJsonLd(item, visit);
    return;
  }
  if (node && typeof node === "object") {
    const obj = node as JsonObject;
    visit(obj);
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walkJsonLd(value, visit);
    }
  }
}

/** `schema:Organization` や `https://schema.org/Organization` のような @type を素の名前にする */
export function stripTypePrefix(name: string): string {
  return name.split(/[/#:]/).pop() || name;
}

/** `@type`（文字列か配列）を素の名前の配列にする。文字列以外は捨てる */
export function typeNamesOf(type: unknown): string[] {
  const list = Array.isArray(type) ? type : type ? [type] : [];
  return list.filter((v): v is string => typeof v === "string").map(stripTypePrefix);
}
