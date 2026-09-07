/**
 * E2E: scripts/e2e/dummy-site.mjs をプロセス内に立てて、実際にクロールする。
 *
 * ダミーサイトには意図的な欠陥（h1 が 2 個・見出しの階層飛び・薄いページ・
 * 壊れた JSON-LD・alt の無い画像・404 へのリンク・サイトマップに無いページ）が
 * 仕込んであるので、それらを検出できることを確かめる。
 * 外部ネットワークには出ない（127.0.0.1 のみ）。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDummySite } from "../../../../scripts/e2e/dummy-site.mjs";
import type { AuditResult } from "../types";

interface DummySite {
  origin: string;
  expected: string[];
  close: () => Promise<void>;
}

let site: DummySite;
let result: AuditResult;

/** ルール ID → 検出された URL */
function urlsFor(res: AuditResult, ruleId: string): string[] {
  return res.issues.filter((i) => i.ruleId === ruleId).map((i) => i.url);
}

beforeAll(async () => {
  // ダミーサイトは 127.0.0.1 で動くので、SSRF 対策の例外を明示的に開ける
  process.env.ALLOW_PRIVATE_HOSTS = "1";
  site = (await startDummySite({ port: 3271 })) as DummySite;
  const { runAudit } = await import("../run");
  result = await runAudit(site.origin, { maxPages: 50 });
}, 120_000);

afterAll(async () => {
  await site?.close();
  delete process.env.ALLOW_PRIVATE_HOSTS;
});

describe("ダミーサイトのクロール", () => {
  it("サイトマップと内部リンクの両方からページを集める", () => {
    expect(result.crawl.analyzed).toBe(site.expected.length);
    expect(result.pages.map((p) => p.url).sort()).toEqual([...site.expected].sort());
    expect(result.crawl.sitemapCount).toBeGreaterThan(0);
    expect(result.crawl.linkCount).toBeGreaterThan(0);
  });

  it("リンクの深さと入次数を計算する", () => {
    const top = result.pages.find((p) => p.url === `${site.origin}/`);
    const deep3 = result.pages.find((p) => p.url === `${site.origin}/deep/3`);
    expect(top?.depth).toBe(0);
    // /news → /deep/1 → /deep/2 → /deep/3
    expect(deep3?.depth).toBe(4);
    expect(top?.inlinks).toBeGreaterThan(0);
  });

  it("取得できなかったページを failures に残す", () => {
    expect(result.failures.map((f) => f.url)).toContain(`${site.origin}/missing`);
  });
});

describe("仕込んである欠陥の検出", () => {
  it("h1 が 2 個ある記事を H1_MULTIPLE にする", () => {
    expect(urlsFor(result, "H1_MULTIPLE")).toEqual([`${site.origin}/blog/post-2`]);
  });

  it("h1 の無いページを H1_MISSING にする", () => {
    expect(urlsFor(result, "H1_MISSING")).toEqual([`${site.origin}/contact`]);
  });

  it("見出しの階層が飛ぶ記事を HEADING_SKIP にする", () => {
    expect(urlsFor(result, "HEADING_SKIP")).toEqual([`${site.origin}/blog/post-3`]);
  });

  it("本文の薄いページを CONTENT_THIN にする", () => {
    // 記事一覧や問い合わせページも本文が短いので一緒に挙がる（誤検出ではない）
    expect(urlsFor(result, "CONTENT_THIN")).toContain(`${site.origin}/blog/post-4`);
    expect(urlsFor(result, "CONTENT_THIN")).not.toContain(`${site.origin}/`);
  });

  it("壊れた JSON-LD を STRUCTURED_DATA_INVALID にする", () => {
    expect(urlsFor(result, "STRUCTURED_DATA_INVALID")).toEqual([`${site.origin}/blog/post-5`]);
  });

  it("alt の無い画像を IMG_ALT_MISSING にする", () => {
    expect(urlsFor(result, "IMG_ALT_MISSING")).toEqual([`${site.origin}/contact`]);
  });

  it("meta description の無いページを META_DESC_MISSING にする", () => {
    expect(urlsFor(result, "META_DESC_MISSING")).toEqual(
      expect.arrayContaining([`${site.origin}/service/a`, `${site.origin}/blog/post-4`]),
    );
  });

  it("404 へのリンクを LINK_BROKEN_INTERNAL、404 の URL 自体を STATUS_4XX にする", () => {
    expect(urlsFor(result, "LINK_BROKEN_INTERNAL")).toEqual([`${site.origin}/blog/post-3`]);
    expect(urlsFor(result, "STATUS_4XX")).toContain(`${site.origin}/missing`);
  });

  it("favicon が無いことを検出する（link も /favicon.ico も無い）", () => {
    expect(urlsFor(result, "FAVICON_MISSING").length).toBe(result.crawl.analyzed);
  });

  it("サイトマップに載っていないページを情報として出す", () => {
    const info = result.issues.find(
      (i) => i.ruleId === "SITEMAP_MISSING" && i.severity === "info",
    );
    expect(info?.detail).toContain("載っていないページが 3 件");
  });
});

describe("誤検出していないこと", () => {
  it("robots.txt と sitemap.xml はあるので不足として出さない", () => {
    expect(urlsFor(result, "ROBOTS_MISSING")).toEqual([]);
    // llms.txt を置いていないダミーサイトなので、サイト単位の課題として出る
    expect(result.issues.some((i) => i.ruleId === "LLMS_TXT_MISSING" && i.severity === "warning")).toBe(true);
    expect(result.issues.filter((i) => i.ruleId === "SITEMAP_MISSING" && i.severity === "error")).toEqual([]);
  });

  it("Googlebot は許可されているので ROBOTS_BLOCKED を出さない", () => {
    expect(urlsFor(result, "ROBOTS_BLOCKED")).toEqual([]);
  });

  it("mixed content は無い（ダミーサイト自体が http なので HTTP_PAGE は全ページに出る）", () => {
    expect(urlsFor(result, "MIXED_CONTENT")).toEqual([]);
    expect(urlsFor(result, "HTTP_PAGE")).toHaveLength(result.crawl.analyzed);
  });

  it("canonical はすべて自分自身を指すので循環にしない", () => {
    expect(urlsFor(result, "CANONICAL_LOOP")).toEqual([]);
    expect(urlsFor(result, "CANONICAL_MISSING")).toEqual([]);
  });

  it("title はページごとに違うので重複にしない", () => {
    expect(urlsFor(result, "TITLE_DUPLICATE")).toEqual([]);
  });
});

describe("結果のかたち", () => {
  it("カテゴリ別・重要度別・ルール別の集計がそろう", () => {
    expect(result.byCategory).toHaveLength(10);
    expect(result.byCategory.reduce((sum, c) => sum + c.count, 0)).toBe(result.issues.length);
    expect(
      result.bySeverity.error + result.bySeverity.warning + result.bySeverity.info,
    ).toBe(result.issues.length);
    expect(result.byRule.reduce((sum, r) => sum + r.count, 0)).toBe(result.issues.length);
  });

  it("AI が無くてもサマリーが入る", () => {
    expect(result.summary?.source).toBe("rule");
    expect(result.summary?.technicalHealth.length).toBeGreaterThan(0);
    expect(result.summary?.priorityActions.length).toBeGreaterThan(0);
  });

  it("先頭の数ページは取得時間を実測している", () => {
    expect(result.crawl.timed).toBeGreaterThan(0);
    expect(result.pages.filter((p) => p.loadMs !== null).length).toBe(result.crawl.timed);
  });
});
