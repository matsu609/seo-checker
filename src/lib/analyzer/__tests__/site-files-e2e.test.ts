/**
 * E2E: ダミーサイト（scripts/e2e/dummy-site.mjs）から実際に robots.txt と
 * sitemap.xml を取ってきて、SiteFiles の組み立てとクローラ判定がつながっているかを見る。
 *
 * 単体テストは SiteFiles を手で作って渡すので、「取得の結果をどう詰めているか」
 * （HTTP ステータス・HTML が返る誤設定・サイトマップの有無）はここでしか通らない。
 * 外部ネットワークには出ない（127.0.0.1 のみ）。
 */
import * as cheerio from "cheerio";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startDummySite } from "../../../../scripts/e2e/dummy-site.mjs";
import { checkCrawlers, fetchSiteFiles, type SiteFiles } from "../robots";

interface DummySite {
  origin: string;
  close: () => Promise<void>;
}

let site: DummySite;
let files: SiteFiles;

beforeAll(async () => {
  // ダミーサイトは 127.0.0.1 で動くので、SSRF 対策の例外を明示的に開ける
  process.env.ALLOW_PRIVATE_HOSTS = "1";
  site = (await startDummySite({ port: 3272 })) as DummySite;
  files = await fetchSiteFiles(site.origin);
}, 120_000);

afterAll(async () => {
  await site?.close();
  delete process.env.ALLOW_PRIVATE_HOSTS;
});

describe("fetchSiteFiles（実際の HTTP）", () => {
  it("robots.txt の取得結果を状態つきで返す", () => {
    expect(files.robotsTxt).toContain("User-agent: *");
    expect(files.robots.status).toBe(200);
    expect(files.robots.html).toBe(false);
    expect(files.robots.length).toBeGreaterThan(0);
  });

  it("Sitemap 行と、定番の場所のサイトマップの両方を見る", () => {
    expect(files.sitemaps).toEqual([`${site.origin}/sitemap.xml`]);
    expect(files.sitemapXml.present).toBe(true);
  });

  it("置かれていない llms.txt は present: false", () => {
    expect(files.llmsTxt.present).toBe(false);
  });
});

describe("取得した robots.txt での判定", () => {
  const run = (path: string) =>
    Object.fromEntries(
      checkCrawlers(
        new URL(`${site.origin}${path}`),
        cheerio.load("<html><head></head><body></body></html>"),
        new Headers(),
        files,
      ).map((r) => [r.id, r]),
    );

  it("robots.txt・書式・サイトマップの 3 項目が pass になる", () => {
    const byId = run("/");
    expect(byId["robots-txt"].status).toBe("pass");
    expect(byId["robots-syntax"].status).toBe("pass");
    expect(byId["robots-sitemap"].status).toBe("pass");
  });

  it("Googlebot も Bingbot も拒否されていないので pass", () => {
    expect(run("/")["search-crawlers-allowed"].status).toBe("pass");
  });

  // ダミーサイトの robots.txt は CCBot（学習用）だけを拒否している
  it("学習用クローラの拒否は参考表示のまま（減点しない）", () => {
    const byId = run("/");
    expect(byId["ai-crawlers-allowed"].status).toBe("pass");
    expect(byId["ai-crawlers-training"].weight).toBe(0);
    expect(byId["ai-crawlers-training"].evidence).toContain("CCBot");
  });

  it("Disallow: /private/ のページは検索エンジンも AI も拒否として出る", () => {
    const byId = run("/private/secret");
    expect(byId["search-crawlers-allowed"].status).toBe("fail");
    expect(byId["ai-crawlers-allowed"].status).toBe("fail");
  });
});
