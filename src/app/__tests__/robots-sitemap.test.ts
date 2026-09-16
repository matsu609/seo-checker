/**
 * 公開範囲がずれないよう固定する。
 * このアプリは検索から見つけさせない（クイック診断はこちらが URL を渡した相手だけが使う）。
 */
import { describe, expect, it } from "vitest";
import robots from "../robots";
import sitemap from "../sitemap";
import { isPublicPath } from "@/lib/auth/routes";

const LEGAL = ["/terms", "/privacy", "/legal/tokushoho"];

/**
 * robots.txt の判定を Google と同じ規則で再現する（より長く一致した行が勝ち、
 * 同じ長さなら Allow が勝つ）。Allow / Disallow の書き換えで
 * 「送ったサイトマップを Googlebot が取りに来られない」事故を防ぐために使う。
 */
function isAllowed(path: string, allow: string[], disallow: string[]): boolean {
  const longest = (rules: string[]) =>
    rules.filter((r) => path.startsWith(r)).reduce((max, r) => Math.max(max, r.length), -1);
  return longest(allow) >= longest(disallow);
}

describe("robots.txt", () => {
  const rule = robots().rules;
  const first = Array.isArray(rule) ? rule[0] : rule;
  const allow = ([] as string[]).concat(first.allow ?? []);
  const disallow = ([] as string[]).concat(first.disallow ?? []);

  it("開けるのは規約類とサイトマップだけ（どれもログイン不要のパス）", () => {
    expect(allow).toEqual([...LEGAL, "/sitemap.xml"]);
    for (const path of allow) expect(isPublicPath(path), path).toBe(true);
  });

  it("それ以外は全部塞ぐ（クイック診断・管理画面・API）", () => {
    expect(disallow).toEqual(["/"]);
    for (const path of ["/", "/meo", "/admin", "/tools/rank", "/api/analyze"]) {
      expect(isAllowed(path, allow, disallow), path).toBe(false);
    }
  });

  it("送信したサイトマップを Googlebot が取りに来られる", () => {
    // Disallow: / だけだと「取得できませんでした」で止まる（2026-09-17 に発生）
    expect(isAllowed("/sitemap.xml", allow, disallow)).toBe(true);
    for (const path of LEGAL) expect(isAllowed(path, allow, disallow), path).toBe(true);
  });

  it("robots.txt が指すサイトマップは sitemap.ts と同じ URL", () => {
    expect(robots().sitemap).toBe("https://app.seo-checker.tokyo/sitemap.xml");
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
