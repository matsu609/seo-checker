/**
 * 公開範囲がずれないよう固定する。robots で開ける URL は、ログイン不要のページと一致させる。
 */
import { describe, expect, it } from "vitest";
import robots from "../robots";
import sitemap from "../sitemap";
import { isPublicPath } from "@/lib/auth/routes";

describe("robots.txt", () => {
  const rule = robots().rules;
  const first = Array.isArray(rule) ? rule[0] : rule;

  it("開けるのはログイン不要のページだけ", () => {
    const allow = ([] as string[]).concat(first.allow ?? []);
    expect(allow.length).toBeGreaterThan(0);
    for (const path of allow) expect(isPublicPath(path), path).toBe(true);
  });

  it("ログインが要る画面と API は塞ぐ", () => {
    const disallow = ([] as string[]).concat(first.disallow ?? []);
    for (const path of ["/tools/", "/settings", "/admin", "/api/"]) expect(disallow).toContain(path);
  });
});

describe("sitemap.xml", () => {
  it("無料診断 2 本が絶対 URL で入っている", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toContain("https://app.seo-checker.tokyo/");
    expect(urls).toContain("https://app.seo-checker.tokyo/meo");
    // ログインが要る画面は出さない
    expect(urls.some((u) => u.includes("/tools/"))).toBe(false);
  });
});
