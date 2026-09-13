/**
 * 公開範囲がずれないよう固定する。
 * このアプリは検索から見つけさせない（クイック診断はこちらが URL を渡した相手だけが使う）。
 */
import { describe, expect, it } from "vitest";
import robots from "../robots";
import sitemap from "../sitemap";
import { isPublicPath } from "@/lib/auth/routes";

const LEGAL = ["/terms", "/privacy", "/legal/tokushoho"];

describe("robots.txt", () => {
  const rule = robots().rules;
  const first = Array.isArray(rule) ? rule[0] : rule;

  it("開けるのは規約類だけ（どれもログイン不要のページ）", () => {
    const allow = ([] as string[]).concat(first.allow ?? []);
    expect(allow).toEqual(LEGAL);
    for (const path of allow) expect(isPublicPath(path), path).toBe(true);
  });

  it("それ以外は全部塞ぐ（クイック診断・管理画面・API）", () => {
    const disallow = ([] as string[]).concat(first.disallow ?? []);
    expect(disallow).toEqual(["/"]);
  });
});

describe("sitemap.xml", () => {
  const urls = sitemap().map((e) => e.url);

  it("規約類だけを絶対 URL で載せる", () => {
    expect(urls).toEqual(LEGAL.map((p) => `https://app.seo-checker.tokyo${p}`));
  });

  it("クイック診断と管理画面は載せない", () => {
    expect(urls).not.toContain("https://app.seo-checker.tokyo/");
    expect(urls.some((u) => u.includes("/meo"))).toBe(false);
    expect(urls.some((u) => u.includes("/tools/"))).toBe(false);
  });
});
