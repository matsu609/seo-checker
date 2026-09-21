import { afterEach, describe, expect, it } from "vitest";
import { parseTopDomains, topDomainsPath, DEFAULT_LIMIT, MAX_LIMIT } from "../mentions";

const KEEP = { ...process.env };
afterEach(() => {
  process.env = { ...KEEP };
});

/** DataForSEO の包み（tasks[0].result[0].items[]） */
function payload(items: unknown[], over: Record<string, unknown> = {}, taskOver: Record<string, unknown> = {}) {
  return {
    cost: 0.033,
    tasks: [{ status_code: 20000, result: [{ total_count: 1234, items, ...over }], ...taskOver }],
  };
}

const BRANDS = { own: ["sample-kobo.jp"], competitors: ["rival.co.jp"] };

describe("業界の地図のパス（#126）", () => {
  it("既定は改名後の top_mentioned_domains", () => {
    expect(topDomainsPath()).toBe("/ai_optimization/llm_mentions/top_mentioned_domains/live");
  });

  it("旧名に戻せる（ドキュメントを直接開けないので逃げ道を残す）", () => {
    process.env.GEO_PATH_MENTIONS_TOP_DOMAINS = "/ai_optimization/llm_mentions/top_domains/live";
    expect(topDomainsPath()).toBe("/ai_optimization/llm_mentions/top_domains/live");
  });

  it("既定の行数は上限より小さい", () => {
    expect(DEFAULT_LIMIT).toBeLessThanOrEqual(MAX_LIMIT);
  });
});

describe("parseTopDomains", () => {
  it("ドメイン・言及数・AI 検索ボリュームを読み、自社と競合に印を付ける", () => {
    const report = parseTopDomains(
      payload([
        { domain: "rival.co.jp", mentions_count: 120, ai_search_volume: 5400 },
        { domain: "www.sample-kobo.jp", mentions_count: 80, ai_search_volume: 900 },
        { domain: "matome.example.com", mentions_count: 40, ai_search_volume: null },
      ]),
      BRANDS,
    );
    expect(report).not.toBeNull();
    expect(report!.rows).toHaveLength(3);
    expect(report!.rows[0]).toMatchObject({ domain: "rival.co.jp", mentions: 120, aiSearchVolume: 5400, isCompetitor: true, isOwn: false });
    // www. は落として照合する
    expect(report!.rows[1]).toMatchObject({ domain: "sample-kobo.jp", isOwn: true, isCompetitor: false });
    expect(report!.rows[2]).toMatchObject({ isOwn: false, isCompetitor: false, aiSearchVolume: null });
    expect(report!.ownRank).toBe(2);
    expect(report!.totalCount).toBe(1234);
    expect(report!.costUsd).toBe(0.033);
  });

  it("自社が表に無ければ ownRank は null（圏外）", () => {
    const report = parseTopDomains(payload([{ domain: "other.example.com", mentions_count: 3 }]), BRANDS);
    expect(report!.ownRank).toBeNull();
  });

  it("サブドメインも自社として数える", () => {
    const report = parseTopDomains(payload([{ domain: "shop.sample-kobo.jp", mentions_count: 3 }]), BRANDS);
    expect(report!.rows[0].isOwn).toBe(true);
  });

  it("キー名が違っても読む（ドキュメントを直接開けないのでゆるく読む）", () => {
    const report = parseTopDomains(payload([{ target: "https://rival.co.jp/a", mentions: "77", search_volume: "1200" }]), BRANDS);
    expect(report!.rows[0]).toMatchObject({ domain: "rival.co.jp", mentions: 77, aiSearchVolume: 1200, isCompetitor: true });
  });

  it("items が無く result そのものが行の配列でも読む", () => {
    const flat = { tasks: [{ status_code: 20000, result: [{ domain: "a.example.com", mentions_count: 5 }] }] };
    expect(parseTopDomains(flat)!.rows[0]).toMatchObject({ domain: "a.example.com", mentions: 5 });
  });

  it("言及数が無い行は 0 にする（行そのものは捨てない）", () => {
    const report = parseTopDomains(payload([{ domain: "a.example.com" }]));
    expect(report!.rows[0].mentions).toBe(0);
  });

  it("ドメインが読めない行は捨てる", () => {
    const report = parseTopDomains(payload([{ mentions_count: 9 }, { domain: "a.example.com", mentions_count: 1 }]));
    expect(report!.rows).toHaveLength(1);
  });

  it("1 行も読めなければ null（0 件と区別する）", () => {
    expect(parseTopDomains(payload([]))).toBeNull();
    expect(parseTopDomains(payload([{ mentions_count: 9 }]))).toBeNull();
    expect(parseTopDomains({ tasks: [{ status_code: 20000, result: [] }] })).toBeNull();
    expect(parseTopDomains(null)).toBeNull();
    expect(parseTopDomains({})).toBeNull();
  });

  it("DataForSEO 側のエラー（status_code 40000 以上）は null", () => {
    const err = payload([{ domain: "a.example.com", mentions_count: 1 }], {}, { status_code: 40501 });
    expect(parseTopDomains(err)).toBeNull();
  });

  it("total_count が無くても落ちない", () => {
    const report = parseTopDomains(payload([{ domain: "a.example.com", mentions_count: 1 }], { total_count: undefined }));
    expect(report!.totalCount).toBeNull();
  });
});
