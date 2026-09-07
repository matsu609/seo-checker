/**
 * E2E: ダミーサイト（scripts/e2e/dummy-site.mjs）を相手に候補ページを集める。
 * ダミーサイトには llms.txt を置いていないので、「未設置」を検出できることも確かめる。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDummySite } from "../../../../scripts/e2e/dummy-site.mjs";
import { renderLlmsTxt } from "../render";
import { toPage } from "../store";
import { INITIAL_STATE } from "../store";
import type { ScanResult } from "../types";

interface DummySite {
  origin: string;
  close: () => Promise<void>;
}

let site: DummySite;
let scan: ScanResult;

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_HOSTS = "1";
  site = (await startDummySite({ port: 3272 })) as DummySite;
  const { scanSite } = await import("../scan");
  scan = await scanSite(site.origin, { limit: 30, excludePaths: "/deep" });
}, 120_000);

afterAll(async () => {
  await site?.close();
  delete process.env.ALLOW_PRIVATE_HOSTS;
});

describe("候補ページの収集", () => {
  it("sitemap と内部リンクからページを集める", () => {
    expect(scan.candidates.length).toBeGreaterThan(10);
    expect(scan.candidates.map((c) => c.url)).toContain(`${site.origin}/`);
    expect(scan.candidates.map((c) => c.url)).toContain(`${site.origin}/company`);
  });

  it("除外パスに一致するページは候補に入らない", () => {
    expect(scan.candidates.map((c) => c.url)).not.toContain(`${site.origin}/deep/1`);
  });

  it("title と meta description が初期値になる", () => {
    const company = scan.candidates.find((c) => c.url === `${site.origin}/company`);
    expect(company?.title).toContain("会社概要");
    expect(company?.description).toContain("サンプル工房");
  });

  it("階層の浅い順に並び、入力 URL が先頭にくる", () => {
    expect(scan.candidates[0].url).toBe(`${site.origin}/`);
    const depths = scan.candidates.map((c) => c.depth);
    expect([...depths].sort((a, b) => a - b)).toEqual(depths);
  });

  it("robots.txt の Sitemap 行を拾う", () => {
    expect(scan.sitemaps).toEqual([`${site.origin}/sitemap.xml`]);
  });

  it("llms.txt が未設置であることを検出する", () => {
    expect(scan.existingLlmsTxt).toBe(false);
  });

  it("title からサイト名を推測する", () => {
    expect(scan.siteName).toBe("サンプル工房");
  });
});

describe("候補からの生成", () => {
  it("集めた候補をそのまま llms.txt にできる", () => {
    const text = renderLlmsTxt({
      ...INITIAL_STATE,
      siteUrl: site.origin,
      siteName: scan.siteName,
      summary: scan.siteSummary,
      pages: scan.candidates.slice(0, 5).map((c) => toPage(c)),
    });
    expect(text.startsWith("# サンプル工房")).toBe(true);
    expect(text).toContain("## 主要コンテンツ");
    expect(text).toContain(`](${site.origin}/company)`);
    // 1 行 1 リンクの形が壊れていないこと
    for (const line of text.split("\n").filter((l) => l.startsWith("- ["))) {
      expect(line).toMatch(/^- \[[^\]]+\]\(\S+\)(: .+)?$/);
    }
  });
});
