import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  aiOverviewPageToken,
  detectFeatures,
  flattenTextBlocks,
  parseAiOverview,
  parseOrganic,
  parseRelatedQuestions,
  parseRelatedSearches,
  parseSerpApiResponse,
} from "../parse";
import { buildSerpApiParams, createSerpApiProvider, SerpError } from "../serpapi";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/serpapi-google.json", import.meta.url), "utf8")) as Record<
  string,
  unknown
>;

describe("parseOrganic", () => {
  it("link の無い項目を飛ばし、sitelinks を拾う", () => {
    const organic = parseOrganic(fixture);
    expect(organic).toHaveLength(3);
    expect(organic[0]).toMatchObject({
      position: 1,
      title: "LLMO とは？AI 時代の最適化を解説",
      url: "https://example.com/blog/llmo",
      displayedUrl: "https://example.com › blog › llmo",
      date: "2026年3月1日",
    });
    expect(organic[0].sitelinks).toEqual([
      { title: "料金", url: "https://example.com/pricing" },
      { title: "事例", url: "https://example.com/cases" },
    ]);
    expect(organic[1].sitelinks).toBeUndefined();
    expect(organic[2].position).toBe(4);
  });
  it("空・壊れた入力", () => {
    expect(parseOrganic(null)).toEqual([]);
    expect(parseOrganic({ organic_results: "x" })).toEqual([]);
  });
});

describe("ai_overview", () => {
  it("text_blocks を本文に平坦化し、references を {url,title} にする", () => {
    const ao = parseAiOverview(fixture.ai_overview);
    expect(ao).not.toBeNull();
    expect(ao!.text).toBe(
      [
        "LLMO（大規模言語モデル最適化）とは、ChatGPT などの生成 AI の回答で自社のコンテンツが引用・言及されやすくするための施策です。",
        "## 主な施策",
        "- 構造化データ: FAQ や Organization の JSON-LD を追加する",
        "- llms.txt を設置する",
        "## SEO との違い",
        "SEO は検索順位、LLMO は AI の回答への引用を目的とします。",
        "観点 | SEO | LLMO",
        "目的 | 順位 | 引用",
      ].join("\n"),
    );
    expect(ao!.references).toEqual([
      {
        url: "https://example.com/blog/llmo",
        title: "LLMO とは？AI 時代の最適化を解説",
        snippet: "LLMO は大規模言語モデル最適化の略で…",
        source: "example.com",
        index: 0,
      },
      {
        url: "https://rival.jp/guide/ai-search",
        title: "生成 AI 検索対策ガイド",
        snippet: "llms.txt の設置手順",
        source: "rival.jp",
        index: 1,
      },
    ]);
  });

  it("page_token だけのときは null で、トークンを返す", () => {
    const raw = { ai_overview: { page_token: "tok", serpapi_link: "https://serpapi.com/..." } };
    expect(parseAiOverview(raw.ai_overview)).toBeNull();
    expect(aiOverviewPageToken(raw)).toBe("tok");
    expect(aiOverviewPageToken(fixture)).toBeNull();
    expect(aiOverviewPageToken({})).toBeNull();
  });

  it("error / 無し は null", () => {
    expect(parseAiOverview({ error: "Google hasn't returned AI overview" })).toBeNull();
    expect(parseAiOverview(undefined)).toBeNull();
    expect(parseAiOverview({ text_blocks: [] })).toBeNull();
  });

  it("flattenTextBlocks は未知の type も snippet を出す", () => {
    expect(flattenTextBlocks([{ type: "mystery", snippet: "x" }, { type: "paragraph" }])).toBe("x");
    expect(flattenTextBlocks("nope")).toBe("");
  });
});

describe("related / features / total", () => {
  it("related_questions / related_searches（重複除去）", () => {
    expect(parseRelatedQuestions(fixture)).toHaveLength(2);
    expect(parseRelatedQuestions(fixture)[1]).toEqual({
      question: "llms.txt とは？",
      snippet: "AI クローラ向けにサイトの概要を書くテキストファイルです。",
      title: "llms.txt の書き方",
      url: "https://rival.jp/guide/llms-txt",
    });
    expect(parseRelatedSearches(fixture)).toEqual(["LLMO 対策", "LLMO SEO 違い"]);
  });

  it("detectFeatures はキーの有無から判定する", () => {
    expect(detectFeatures(fixture)).toEqual([
      "ai_overview",
      "knowledge_graph",
      "people_also_ask",
      "related_searches",
      "sitelinks",
    ]);
    expect(detectFeatures({ ai_overview: { error: "x" }, inline_videos: [] })).toEqual([]);
  });

  it("parseSerpApiResponse で全部まとまる", () => {
    const result = parseSerpApiResponse(fixture, { query: "LLMO とは", device: "mobile", fetchedAt: "2026-09-01T00:00:00.000Z" });
    expect(result.query).toBe("LLMO とは");
    expect(result.device).toBe("mobile");
    expect(result.organic).toHaveLength(3);
    expect(result.totalResults).toBe(1230000);
    expect(result.features).toContain("ai_overview");
    expect(result.aiOverview?.references).toHaveLength(2);
    expect(result.provider).toBe("serpapi");
    expect(result.fetchedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(result.raw).toBe(fixture);
  });

  it("AI Overviews が別取得なら差し込み、枠が無ければ features からも外す", () => {
    const base = { ...fixture, ai_overview: { page_token: "tok" } };
    // page_token だけ = AIO の枠は出ていたが本文が別リクエスト。本文を解決せずに
    // ここへ来たのは取得できなかったということなので、「表示なし」ではなく未取得
    const unresolved = parseSerpApiResponse(base, { query: "q", device: "desktop" });
    expect(unresolved.aiOverview).toBeNull();
    expect(unresolved.aiOverviewUnavailable).toBe(true);
    expect(unresolved.features).toContain("ai_overview");

    // ai_overview のキー自体が無いときだけが本当の「表示なし」
    const withoutAio = { ...fixture };
    delete withoutAio.ai_overview;
    const none = parseSerpApiResponse(withoutAio, { query: "q", device: "desktop" });
    expect(none.aiOverview).toBeNull();
    expect(none.features).not.toContain("ai_overview");
    expect(none.aiOverviewUnavailable).toBeUndefined();

    // 取得に失敗した場合は「表示なし」にせず、未取得として features には残す
    const failed = parseSerpApiResponse(base, { query: "q", device: "desktop", aiOverviewUnavailable: true });
    expect(failed.aiOverview).toBeNull();
    expect(failed.aiOverviewUnavailable).toBe(true);
    expect(failed.features).toContain("ai_overview");

    const merged = parseSerpApiResponse(base, { query: "q", device: "desktop", aiOverviewRaw: fixture.ai_overview });
    expect(merged.aiOverview?.text).toContain("LLMO（大規模言語モデル最適化）");
    expect(merged.features[0]).toBe("ai_overview");
    expect((merged.raw as { ai_overview: unknown }).ai_overview).toBe(fixture.ai_overview);
  });
});

describe("serpapi provider", () => {
  it("パラメータは engine=google, gl=jp, hl=ja, num=100, device", () => {
    const p = buildSerpApiParams({ q: "LLMO とは" }, "KEY");
    expect(p.get("engine")).toBe("google");
    expect(p.get("gl")).toBe("jp");
    expect(p.get("hl")).toBe("ja");
    expect(p.get("num")).toBe("100");
    expect(p.get("device")).toBe("desktop");
    expect(p.get("api_key")).toBe("KEY");
    expect(buildSerpApiParams({ q: "x", num: 5, device: "mobile", location: "Tokyo, Japan" }, "K").get("num")).toBe("10");
  });

  it("page_token があれば google_ai_overview を追加で取りに行く", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("engine=google_ai_overview")) {
        return new Response(JSON.stringify({ ai_overview: fixture.ai_overview }), { status: 200 });
      }
      return new Response(JSON.stringify({ ...fixture, ai_overview: { page_token: "tok" } }), { status: 200 });
    };
    const provider = createSerpApiProvider("KEY", { fetchImpl });
    const result = await provider.search({ q: "LLMO とは" });
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("engine=google&q=LLMO");
    expect(calls[1]).toContain("page_token=tok");
    expect(result.aiOverview?.references).toHaveLength(2);
    expect(result.organic).toHaveLength(3);
  });

  it("google_ai_overview が失敗しても本体は返し、未取得として印を付ける", async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("engine=google_ai_overview")) return new Response("{}", { status: 429 });
      return new Response(JSON.stringify({ ...fixture, ai_overview: { page_token: "tok" } }), { status: 200 });
    };
    const provider = createSerpApiProvider("KEY", { fetchImpl });
    const result = await provider.search({ q: "LLMO とは" });
    expect(result.aiOverview).toBeNull();
    expect(result.aiOverviewUnavailable).toBe(true);
    expect(result.organic).toHaveLength(3);
  });

  it("401 / 429 は SerpError", async () => {
    const make = (status: number) =>
      createSerpApiProvider("KEY", { fetchImpl: async () => new Response("{}", { status }) });
    await expect(make(401).search({ q: "x" })).rejects.toMatchObject({ code: "auth" });
    await expect(make(429).search({ q: "x" })).rejects.toBeInstanceOf(SerpError);
    await expect(
      createSerpApiProvider("KEY", {
        fetchImpl: async () => new Response(JSON.stringify({ error: "Missing query" }), { status: 400 }),
      }).search({ q: "x" }),
    ).rejects.toMatchObject({ code: "bad_request", message: "SerpApi エラー: Missing query" });
    await expect(make(200).search({ q: "  " })).rejects.toMatchObject({ code: "bad_request" });
  });
});

describe("AI Overviews の未取得と表示なしの区別", () => {
  const ctx = { query: "テスト", device: "desktop" as const };

  it("ai_overview が無ければ「表示なし」", () => {
    const r = parseSerpApiResponse({ organic_results: [] }, ctx);
    expect(r.aiOverview).toBeNull();
    expect(r.aiOverviewUnavailable).toBeUndefined();
    expect(r.features).not.toContain("ai_overview");
  });

  it("ai_overview が error だけなら「未取得」（表示なしにしない）", () => {
    const r = parseSerpApiResponse({ ai_overview: { error: "not available" } }, ctx);
    expect(r.aiOverview).toBeNull();
    expect(r.aiOverviewUnavailable).toBe(true);
    expect(r.features).toContain("ai_overview");
  });

  it("page_token だけで本文を解決できなかった場合も「未取得」", () => {
    const r = parseSerpApiResponse({ ai_overview: { page_token: "abc" } }, ctx);
    expect(r.aiOverview).toBeNull();
    expect(r.aiOverviewUnavailable).toBe(true);
  });

  it("2 回目の取得結果が空でも「未取得」", () => {
    const r = parseSerpApiResponse(
      { ai_overview: { page_token: "abc" } },
      { ...ctx, aiOverviewRaw: { text_blocks: [] } },
    );
    expect(r.aiOverview).toBeNull();
    expect(r.aiOverviewUnavailable).toBe(true);
  });

  it("本文が取れていれば未取得フラグは立たない", () => {
    const r = parseSerpApiResponse(
      { ai_overview: { text_blocks: [{ snippet: "概要です" }] } },
      ctx,
    );
    expect(r.aiOverview?.text).toContain("概要");
    expect(r.aiOverviewUnavailable).toBeUndefined();
    expect(r.features).toContain("ai_overview");
  });
});
