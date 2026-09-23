import type * as cheerio from "cheerio";

/**
 * `<meta name="…">` の読み取り。クイック診断・サイト診断・ページ診断（page-report）で共有する。
 *
 * 2026-09-23 に 1 か所へまとめた。以前は `meta[name="robots"]` のように大文字小文字を
 * 区別するセレクタで最初の 1 つだけを読んでいたため、`<meta name="ROBOTS" content="NOINDEX">`
 * や `<meta name="Description">` を見落とし、robots と googlebot の 2 つを書いたページでは
 * 後ろの noindex を拾えなかった。HTML の name の値は大文字小文字を区別しない。
 */

/** name が一致する meta の content を、出てくる順にすべて返す（name は大文字小文字を区別しない） */
export function metaContentsByName($: cheerio.CheerioAPI, name: string): string[] {
  const wanted = name.toLowerCase();
  const out: string[] = [];
  $("meta[name]").each((_, el) => {
    const n = ($(el).attr("name") ?? "").trim().toLowerCase();
    if (n !== wanted) return;
    const content = $(el).attr("content");
    if (typeof content === "string") out.push(content);
  });
  return out;
}

/** name が一致する meta のうち、中身のある最初の content（前後の空白は落とす）。無ければ null */
export function metaContentByName($: cheerio.CheerioAPI, name: string): string | null {
  for (const content of metaContentsByName($, name)) {
    const t = content.trim();
    if (t) return t;
  }
  return null;
}

/** name が一致する meta があるか */
export function hasMetaName($: cheerio.CheerioAPI, name: string): boolean {
  const wanted = name.toLowerCase();
  return $("meta[name]")
    .toArray()
    .some((el) => ($(el).attr("name") ?? "").trim().toLowerCase() === wanted);
}

/**
 * Google の索引に効く meta robots を 1 本の文字列にする（小文字、「, 」区切り）。
 * `robots`（全クローラ向け）と `googlebot`（Google 向け）の両方を、複数あればすべて読む。
 * どれか 1 つでも noindex なら Google は索引しないため（monitor/checks.ts も同じ 2 つを読む）。
 */
export function readMetaRobots($: cheerio.CheerioAPI): string {
  return ["robots", "googlebot"]
    .flatMap((name) => metaContentsByName($, name))
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .join(", ");
}

/**
 * robots の指定（meta robots の content か X-Robots-Tag の値）に noindex が含まれるか。
 * `none` は `noindex, nofollow` と同じ意味なので noindex として扱う。
 * `max-image-preview:none` の `none` は別物なので、トークン単位で見る。
 * X-Robots-Tag の `googlebot: noindex` のような UA 付きの書き方も読む。
 */
export function hasNoindexDirective(value: string): boolean {
  for (const raw of value.toLowerCase().split(",")) {
    const token = raw.trim();
    // 「noindex nofollow」のような空白区切りの誤記も、従来どおり noindex として読む
    if (token.split(/[\s:]+/).includes("noindex")) return true;
    const m = /^(?:([a-z0-9_-]+)\s*:\s*)?none$/.exec(token);
    // max-image-preview:none などの「値としての none」は除く
    if (m && !(m[1] ?? "").startsWith("max-")) return true;
  }
  return false;
}
