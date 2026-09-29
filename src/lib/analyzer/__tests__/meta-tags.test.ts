import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import { parseAuditPage } from "@/lib/audit/parse";
import { ruleNoindex } from "@/lib/audit/rules/page";
import { measurePage } from "@/lib/page-report/extract";
import { extractMeta } from "../meta";
import { hasMetaName, hasNoindexDirective, metaContentByName, readMetaRobots } from "../meta-tags";
import { readNoindex } from "../robots";

/**
 * meta name の読み取り（2026-09-23 に 1 か所へまとめた）。
 * 以前は大文字小文字を区別して最初の 1 つだけを読んでいたため、
 * `<meta name="ROBOTS" content="NOINDEX">` や `<meta name="Description">` を見落としていた。
 */

const html = (head: string) => `<!doctype html><html lang="ja"><head><title>t</title>${head}</head><body><h1>h</h1><p>本文</p></body></html>`;

describe("meta-tags", () => {
  it("name は大文字小文字を区別せず、中身のある最初の content を返す", () => {
    const $ = cheerio.load(html('<meta name="Description" content="  説明文  "><meta name="VIEWPORT" content="width=device-width">'));
    expect(metaContentByName($, "description")).toBe("説明文");
    expect(hasMetaName($, "viewport")).toBe(true);
    expect(extractMeta($).description).toBe("説明文");
  });

  it("robots と googlebot をすべて読んで小文字でつなぐ", () => {
    const $ = cheerio.load(html('<meta name="ROBOTS" content="INDEX, FOLLOW"><meta name="googlebot" content="noindex">'));
    expect(readMetaRobots($)).toBe("index, follow, noindex");
  });

  it.each([
    ["noindex", true],
    ["NOINDEX, NOFOLLOW", true],
    ["none", true],
    ["googlebot: noindex", true],
    ["googlebot: none", true],
    ["noindex nofollow", true],
    ["index, follow", false],
    ["max-image-preview:none", false],
    ["max-image-preview: none, max-snippet:-1", false],
    ["", false],
  ])("hasNoindexDirective(%j) = %s", (value, expected) => {
    expect(hasNoindexDirective(value)).toBe(expected);
  });
});

describe("3 つの診断が同じ読み方をする", () => {
  const cases = [
    '<meta name="ROBOTS" content="NOINDEX">',
    '<meta name="robots" content="none">',
    '<meta name="robots" content="index"><meta name="googlebot" content="noindex">',
  ];
  const fetched = (head: string) => ({
    ok: true,
    status: 200,
    finalUrl: "https://example.test/page",
    contentType: "text/html",
    body: html(head),
    headers: new Headers(),
  });

  it.each(cases)("クイック診断: %s を noindex とみなす", (head) => {
    expect(readNoindex(cheerio.load(html(head)), new Headers()).noindex).toBe(true);
  });

  it.each(cases)("サイト診断: %s を NOINDEX にする", (head) => {
    const { page } = parseAuditPage(fetched(head), { requestedUrl: "https://example.test/page" });
    const issues = ruleNoindex(page, {} as never);
    expect(issues.map((i) => i.ruleId)).toEqual(["NOINDEX"]);
  });

  it.each(cases)("ページ診断: %s を noindex とみなす", (head) => {
    expect(measurePage(fetched(head)).noindex).toBe(true);
  });

  it("X-Robots-Tag の none も noindex", () => {
    expect(readNoindex(cheerio.load(html("")), new Headers({ "x-robots-tag": "none" })).noindex).toBe(true);
  });
});
