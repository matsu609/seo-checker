/**
 * SEO 順位を利用者ごとに引く（2026-09-23）。
 *
 * 共有の計測（geo_measurements）には誰のドメインも入っていないので、以前は順位が
 * 必ず null になり、全キーワードが「圏外」と表示されていた。自然検索の並びを計測に残し、
 * 集計のときに利用者のドメインで引く。
 */
import { describe, expect, it } from "vitest";
import { createDataForSeoProvider, parseSerpResult } from "../dataforseo";
import { compactOrganic, decodeStoredCitations, encodeStoredCitations, rankForDomains } from "../organic";
import { toKeywordOutcome } from "../store";

const SERP = {
  tasks: [
    {
      status_code: 20000,
      result: [
        {
          items: [
            { type: "organic", domain: "other.com", rank_absolute: 1 },
            { type: "ai_overview", references: [{ url: "https://note.com/a", title: "記事" }] },
            { type: "organic", domain: "www.sample-kobo.jp", rank_absolute: 4 },
            { type: "organic", domain: "blog.sample-kobo.jp", rank_absolute: 7 },
            { type: "organic", domain: "other.com", rank_absolute: 9 },
          ],
        },
      ],
    },
  ],
};

describe("自然検索の並びを残す", () => {
  it("対象ドメインを渡さなくても、並びは全部残る（同じドメインは最上位だけ）", () => {
    const parsed = parseSerpResult(SERP);
    expect(parsed?.rank).toBeNull();
    expect(parsed?.organic).toEqual([
      { domain: "other.com", rank: 1 },
      { domain: "sample-kobo.jp", rank: 4 },
      { domain: "blog.sample-kobo.jp", rank: 7 },
    ]);
    // AI Overviews の参照リンクは引用のまま（並びには混ぜない）
    expect(parsed?.citations.map((c) => c.domain)).toEqual(["note.com"]);
  });

  it("利用者のドメイン（サブドメインを含む）の最上位が順位。出ていなければ圏外（null）", () => {
    const organic = compactOrganic([
      { domain: "blog.sample-kobo.jp", rank: 7 },
      { domain: "www.sample-kobo.jp", rank: 4 },
    ]);
    expect(rankForDomains(organic, ["sample-kobo.jp"])).toBe(4);
    expect(rankForDomains(organic, ["https://www.sample-kobo.jp/"])).toBe(4);
    expect(rankForDomains(organic, ["rival.co.jp"])).toBeNull();
    expect(rankForDomains(organic, [])).toBeNull();
    // 似た名前の別ドメインは拾わない
    expect(rankForDomains([{ domain: "notsample-kobo.jp", rank: 2 }], ["sample-kobo.jp"])).toBeNull();
  });

  it("順位計測のときだけ並びを返す（AI Overviews / AI モードでは保存量を増やさない）", async () => {
    process.env.DATAFORSEO_LOGIN = "login";
    process.env.DATAFORSEO_PASSWORD = "password";
    try {
      const fetchImpl = (async () => new Response(JSON.stringify(SERP), { status: 200 })) as unknown as typeof fetch;
      const provider = createDataForSeoProvider({ fetchImpl });
      const rank = await provider.run({ kind: "rank", text: "SEO ツール", model: "aio", locale: "ja", mode: "standard" });
      const aio = await provider.run({ kind: "aio", text: "SEO ツール", model: "aio", locale: "ja", mode: "standard" });
      expect(rank.result?.organic).toHaveLength(3);
      expect(aio.result?.organic).toBeNull();
    } finally {
      delete process.env.DATAFORSEO_LOGIN;
      delete process.env.DATAFORSEO_PASSWORD;
    }
  });
});

describe("citations 列に一緒に入れる（表を増やさない）", () => {
  const citation = { url: "https://note.com/a", unresolved: false, domain: "note.com", title: null };

  it("並びがあるときだけ包み、読むときに分ける", () => {
    const stored = encodeStoredCitations([citation], [{ domain: "sample-kobo.jp", rank: 4 }]);
    expect(decodeStoredCitations(stored)).toEqual({ citations: [citation], organic: [{ domain: "sample-kobo.jp", rank: 4 }] });
    // 引用だけの計測は従来どおり配列
    expect(encodeStoredCitations([citation], null)).toEqual([citation]);
    expect(decodeStoredCitations([citation])).toEqual({ citations: [citation], organic: null });
  });

  it("上位に 1 件も無かった（空）と、並びを保存していない（null）を区別する", () => {
    expect(decodeStoredCitations(encodeStoredCitations([], [])).organic).toEqual([]);
    expect(decodeStoredCitations([]).organic).toBeNull();
    expect(decodeStoredCitations(null)).toEqual({ citations: [], organic: null });
  });
});

describe("キーワードごとの成果の順位", () => {
  const row = (kind: string, citations: unknown, rank: number | null = null) => ({
    keyword_id: "k1",
    cited: false,
    geo_measurements: { kind, model: "aio", executed_at: "2026-09-21T20:00:00Z", rank, citations },
  });

  it("並びから自社ドメインで順位を引く（以前はいつも圏外）", () => {
    const stored = encodeStoredCitations([], [{ domain: "other.com", rank: 1 }, { domain: "sample-kobo.jp", rank: 4 }]);
    expect(toKeywordOutcome(row("rank", stored), ["sample-kobo.jp"])?.rank).toBe(4);
    expect(toKeywordOutcome(row("rank", stored), ["rival.co.jp"])?.rank).toBeNull();
  });

  it("並びが無い古い順位計測は「圏外」ではなく未計測として捨てる", () => {
    expect(toKeywordOutcome(row("rank", []), ["sample-kobo.jp"])).toBeNull();
  });

  it("引用の数に自然検索の並びを数えない", () => {
    const stored = encodeStoredCitations([], [{ domain: "sample-kobo.jp", rank: 4 }]);
    expect(toKeywordOutcome(row("rank", stored), ["sample-kobo.jp"])?.citationCount).toBe(0);
    const aio = toKeywordOutcome(row("aio", [{ url: "https://a.com", unresolved: false, domain: "a.com", title: null }]), ["sample-kobo.jp"]);
    expect(aio?.citationCount).toBe(1);
    expect(aio?.rank).toBeNull();
  });
});
