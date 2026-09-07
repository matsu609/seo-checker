import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSerpApiResponse } from "@/lib/serp/parse";
import type { SerpResult } from "@/lib/serp/types";
import { classifyAio } from "../classify";
import { findRank, hostOf, matchesDomain, measureAioOverview, measureFromSerp, runPool, toReferences } from "../measure";

function fixture(name: string, query: string, device: "desktop" | "mobile" = "desktop"): SerpResult {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8")) as unknown;
  return parseSerpApiResponse(raw, { query, device, fetchedAt: "2026-09-01T00:00:00.000Z" });
}

const SELF = "example.com";
const COMPETITORS = ["rival.co.jp", "deep.example.org"];

describe("ドメイン照合", () => {
  it("www. とスキームを外して比較し、サブドメインも自社扱いにする", () => {
    expect(hostOf("https://www.Example.com/blog/aio")).toBe("example.com");
    expect(hostOf("not a url")).toBe("");
    expect(matchesDomain("blog.example.com", "example.com")).toBe(true);
    expect(matchesDomain("example.com", "https://www.example.com/path")).toBe(true);
    expect(matchesDomain("notexample.com", "example.com")).toBe(false);
    expect(matchesDomain("", "example.com")).toBe(false);
  });
});

describe("findRank", () => {
  const serp = fixture("serpapi-aio", "AIO 対策");

  it("同じドメインが複数あれば最上位を採用する", () => {
    expect(findRank(serp.organic, [SELF])).toEqual({
      rank: 3,
      url: "https://blog.example.com/aio",
      title: "自社ブログ",
    });
  });

  it("100 位より下は圏外にする", () => {
    expect(findRank(serp.organic, ["deep.example.org"])).toEqual({ rank: null, url: null, title: null });
  });

  it("見つからなければ圏外", () => {
    expect(findRank(serp.organic, ["unknown.example"])).toEqual({ rank: null, url: null, title: null });
    expect(findRank([], [SELF]).rank).toBeNull();
  });
});

describe("measureFromSerp", () => {
  it("1 回の SERP から自社順位・競合順位・AIO・フィーチャーを導く", () => {
    const serp = fixture("serpapi-aio", "AIO 対策");
    const m = measureFromSerp(serp, { projectDomain: SELF, competitorDomains: COMPETITORS, includeAioText: true });

    expect(m.keyword).toBe("AIO 対策");
    expect(m.rank).toBe(3);
    expect(m.url).toBe("https://blog.example.com/aio");
    expect(m.competitors).toEqual([
      { domain: "rival.co.jp", rank: 2, url: "https://rival.co.jp/column/aio", title: "競合の記事" },
      { domain: "deep.example.org", rank: null, url: null, title: null },
    ]);
    expect(m.aiOverview.present).toBe(true);
    expect(m.aiOverview.selfCited).toBe(true);
    expect(m.aiOverview.competitorCited).toBe(true);
    expect(m.aiOverview.citedCompetitors).toEqual(["rival.co.jp"]);
    // 末尾スラッシュ違いの重複参照は 1 件にまとめる
    expect(m.aiOverview.references).toHaveLength(3);
    expect(m.aiOverview.references[0]).toEqual({
      url: "https://www.example.com/blog/aio",
      title: "AIO 対策の基本",
      domain: "example.com",
    });
    expect(m.aiOverview.text).toContain("AIO 対策とは");
    expect(m.features).toContain("ai_overview");
    expect(m.totalResults).toBe(1234000);
    expect(classifyAio(m.aiOverview)).toBe("both");
  });

  it("includeAioText を付けなければ本文は保存しない", () => {
    const serp = fixture("serpapi-aio", "AIO 対策");
    const m = measureFromSerp(serp, { projectDomain: SELF, competitorDomains: COMPETITORS });
    expect(m.aiOverview.text).toBeUndefined();
  });

  it("AIO が無い SERP では present=false・圏外になる", () => {
    const serp = fixture("serpapi-no-aio", "順位計測 ツール", "mobile");
    const m = measureFromSerp(serp, { projectDomain: SELF, competitorDomains: COMPETITORS, location: "Tokyo, Japan" });
    expect(m.device).toBe("mobile");
    expect(m.location).toBe("Tokyo, Japan");
    expect(m.rank).toBeNull();
    expect(m.aiOverview).toMatchObject({ present: false, selfCited: false, competitorCited: false, references: [] });
    expect(m.features).not.toContain("ai_overview");
    expect(classifyAio(m.aiOverview)).toBe("none");
  });

  it("references が無い AIO は「自社&競合なし」になる", () => {
    const serp = fixture("serpapi-aio-no-refs", "AI 検索 最適化");
    const m = measureFromSerp(serp, { projectDomain: SELF, competitorDomains: COMPETITORS });
    expect(m.aiOverview.present).toBe(true);
    expect(m.aiOverview.references).toEqual([]);
    expect(m.aiOverview.citedCompetitors).toBeUndefined();
    expect(classifyAio(m.aiOverview)).toBe("neither");
  });

  it("競合ドメインが未指定でも落ちない", () => {
    const serp = fixture("serpapi-aio", "AIO 対策");
    const m = measureFromSerp(serp, { projectDomain: SELF });
    expect(m.competitors).toEqual([]);
    expect(m.aiOverview.competitorCited).toBe(false);
    expect(classifyAio(m.aiOverview)).toBe("self");
  });
});

describe("toReferences", () => {
  it("AIO が無ければ空", () => {
    expect(toReferences(fixture("serpapi-no-aio", "順位計測 ツール"))).toEqual([]);
  });
});

describe("measureAioOverview", () => {
  it("自社ドメインが空文字なら自社引用にはしない", () => {
    const serp = fixture("serpapi-aio", "AIO 対策");
    const aio = measureAioOverview(serp, { projectDomain: "" });
    expect(aio.selfCited).toBe(false);
  });

  it("AIO の本文を取得できなかったときは「表示なし」にせず未取得にする", () => {
    const serp: SerpResult = {
      ...fixture("serpapi-no-aio", "AIO 対策"),
      aiOverview: null,
      aiOverviewUnavailable: true,
    };
    const aio = measureAioOverview(serp, { projectDomain: SELF });
    expect(aio.unavailable).toBe(true);
    // 5 区分には含めない（null = 未取得。集計の分母から外れる）
    expect(classifyAio(aio)).toBeNull();
  });
});

describe("runPool", () => {
  it("同時実行数を守り、入力順で結果を返す", async () => {
    let running = 0;
    let peak = 0;
    const items = Array.from({ length: 7 }, (_, i) => i);
    const out = await runPool(items, 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("空配列でも待ち続けない", async () => {
    await expect(runPool([], 3, async () => 1)).resolves.toEqual([]);
  });
});
