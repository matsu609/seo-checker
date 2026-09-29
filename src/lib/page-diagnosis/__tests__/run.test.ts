/**
 * ページ診断の実行（ネットワークに出ない。SERP と取得は差し替える）。
 *
 * 2026-09-23: 対象 URL と検索結果の URL の突き合わせがスキーム・www・末尾のスラッシュの
 * 違いを吸収しておらず、お客様のページを Top10 の平均（比較相手）に混ぜていた。
 */
import { describe, expect, it } from "vitest";
import type { SerpProvider, SerpResult } from "@/lib/serp/types";
import { measureHtml } from "../measure";
import { runDiagnosis, urlKey } from "../run";

const page = (chars: number) => `<html><head><title>t</title></head><body><main><h1>見出し</h1><p>${"あ".repeat(chars)}</p></main></body></html>`;

describe("urlKey", () => {
  it("スキーム・www・末尾のスラッシュ・クエリ・大文字小文字を無視する", () => {
    const key = urlKey("https://www.example.com/service/");
    expect(urlKey("example.com/service")).toBe(key);
    expect(urlKey("http://Example.com/Service?utm=1#top")).toBe(key);
    expect(urlKey("https://example.com/other")).not.toBe(key);
  });
});

describe("runDiagnosis", () => {
  it("入力 URL の書き方が検索結果と違っても、自社ページを Top10 の平均に入れない", async () => {
    const serp: SerpResult = {
      query: "kw",
      device: "desktop",
      organic: [
        { position: 1, title: "自社", url: "https://www.example.com/service/" },
        { position: 2, title: "他社 A", url: "https://a.test/" },
        { position: 3, title: "他社 B", url: "https://b.test/" },
      ],
      features: [],
      aiOverview: null,
      relatedQuestions: [],
      relatedSearches: [],
      totalResults: null,
      fetchedAt: "2026-09-23",
      provider: "test",
      raw: null,
    };
    const provider: SerpProvider = { name: "test", search: async () => serp };
    const chars: Record<string, number> = {
      "https://www.example.com/service/": 5000,
      "https://a.test/": 1000,
      "https://b.test/": 3000,
    };
    const fetched: string[] = [];
    const result = await runDiagnosis({
      keyword: "kw",
      url: "example.com/service",
      provider,
      anthropicEnabled: false,
      fetcher: async (url) => {
        fetched.push(url);
        return measureHtml(page(chars[url] ?? 10), url);
      },
    });
    // 同じページを 2 度取らない
    expect(fetched.sort()).toEqual(Object.keys(chars).sort());
    expect(result.self).not.toBeNull();
    // 平均は他社 2 件だけ（自社の 5000 文字を混ぜると 3000 前後になる）
    const others = result.competitors.filter((c) => c.position !== 1).map((c) => c.measurement?.charCount ?? 0);
    expect(result.stats.charCount.count).toBe(2);
    expect(result.stats.charCount.average).toBe((others[0] + others[1]) / 2);
    expect(result.stats.charCount.average).toBeLessThan(2500);
  });
});
