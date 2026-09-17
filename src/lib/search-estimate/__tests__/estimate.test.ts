/**
 * 推定の計算と、DataForSEO の応答の読み取りのテスト。ネットワークには出ない。
 */
import { describe, expect, it } from "vitest";
import { estimateRow, summarize } from "../estimate";
import { normalizeTarget, parseRankedKeywords, rankedKeywordsPath } from "../dataforseo";
import type { RankedKeyword } from "../types";

const kw = (keyword: string, rank: number | null, monthlyVolume: number | null): RankedKeyword => ({
  keyword,
  rank,
  monthlyVolume,
  url: null,
});

describe("1 キーワードの推定", () => {
  it("表示回数は月間検索数、クリックは検索数 × CTR", () => {
    const row = estimateRow(kw("歯科 渋谷", 1, 1000));
    expect(row.impressions).toBe(1000);
    expect(row.ctr).toBe(0.28);
    expect(row.clicks).toBeCloseTo(280, 6);
  });

  it("圏外は CTR 0 でクリックも 0", () => {
    const row = estimateRow(kw("圏外の語", null, 500));
    expect(row.ctr).toBe(0);
    expect(row.clicks).toBe(0);
    expect(row.impressions).toBe(500);
  });

  // 0 として数えるとサイト全体の推定が黙って小さくなる
  it("月間検索数が不明なら推定は出さない（null のまま）", () => {
    const row = estimateRow(kw("検索数不明", 3, null));
    expect(row.impressions).toBeNull();
    expect(row.clicks).toBeNull();
  });

  it("負の検索数は不明として扱う", () => {
    expect(estimateRow(kw("壊れた値", 3, -5)).impressions).toBeNull();
  });
});

describe("まとめ", () => {
  const rows = [kw("a", 1, 1000), kw("b", 5, 200), kw("c", 30, 100), kw("d", 2, null), kw("e", null, 50)];
  const result = summarize("example.jp", rows, "2026-09-17T00:00:00.000Z");

  it("検索数が分かる行だけを合計する", () => {
    // d は検索数が不明なので分子・分母どちらにも入れない
    expect(result.counted).toBe(4);
    expect(result.keywords).toBe(5);
    expect(result.impressions).toBe(1000 + 200 + 100 + 50);
  });

  it("クリックは順位別 CTR の合計", () => {
    // 1位 0.28×1000 + 5位 0.07×200 + 30位 0.003×100 + 圏外 0×50
    expect(result.clicks).toBe(Math.round(280 + 14 + 0.3 + 0));
  });

  it("CTR はクリック ÷ 表示回数", () => {
    expect(result.ctr).toBeCloseTo(result.clicks / result.impressions, 2);
  });

  // 検索数 1 の語と 10,000 の語を同じ重みにしない
  it("平均順位は検索数で重み付けする", () => {
    // (1×1000 + 5×200 + 30×100) / 1300。圏外（順位 null）は重みに入れない
    expect(result.averageRank).toBeCloseTo((1 * 1000 + 5 * 200 + 30 * 100) / 1300, 6);
  });

  it("順位帯の件数", () => {
    expect(result.top3).toBe(2); // a(1) と d(2)
    expect(result.top10).toBe(3); // + b(5)
    expect(result.top50).toBe(4); // + c(30)
  });

  it("推定クリックの多い順に並び、不明は最後", () => {
    expect(result.rows[0].keyword).toBe("a");
    expect(result.rows[result.rows.length - 1].keyword).toBe("d");
  });

  it("1 件も無ければ 0 と null になり、例外にはしない", () => {
    const empty = summarize("example.jp", [], "2026-09-17T00:00:00.000Z");
    expect(empty.impressions).toBe(0);
    expect(empty.ctr).toBeNull();
    expect(empty.averageRank).toBeNull();
  });
});

describe("ドメインの正規化", () => {
  it("スキーム・www・パスを落とす", () => {
    expect(normalizeTarget("https://www.Example.JP/blog/1?a=b")).toBe("example.jp");
    expect(normalizeTarget(" example.jp ")).toBe("example.jp");
    expect(normalizeTarget("")).toBe("");
  });
});

describe("DataForSEO の応答の読み取り", () => {
  const payload = {
    tasks: [
      {
        status_code: 20000,
        result: [
          {
            items: [
              {
                keyword_data: { keyword: "歯科 渋谷", keyword_info: { search_volume: 1300 } },
                ranked_serp_element: { serp_item: { rank_group: 3, rank_absolute: 4, url: "https://example.jp/a" } },
              },
              {
                keyword_data: { keyword: "検索数なし", keyword_info: {} },
                ranked_serp_element: { serp_item: { rank_absolute: 12 } },
              },
              // keyword が無い行は捨てる
              { keyword_data: {}, ranked_serp_element: {} },
            ],
          },
        ],
      },
    ],
  };

  it("keyword / 順位 / 検索数 / URL を拾う", () => {
    const rows = parseRankedKeywords(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ keyword: "歯科 渋谷", rank: 3, monthlyVolume: 1300, url: "https://example.jp/a" });
  });

  it("rank_group が無ければ rank_absolute を使い、検索数が無ければ null", () => {
    const rows = parseRankedKeywords(payload);
    expect(rows[1]).toEqual({ keyword: "検索数なし", rank: 12, monthlyVolume: null, url: null });
  });

  it("エラーのタスクは読まない", () => {
    expect(parseRankedKeywords({ tasks: [{ status_code: 40400, result: [] }] })).toEqual([]);
  });

  it("壊れた入力でも例外を投げない", () => {
    expect(parseRankedKeywords(null)).toEqual([]);
    expect(parseRankedKeywords({ tasks: "x" })).toEqual([]);
    expect(parseRankedKeywords({ tasks: [{ result: [{ items: [1, 2] }] }] })).toEqual([]);
  });
});

describe("エンドポイントの差し替え", () => {
  it("既定は Labs の ranked_keywords", () => {
    expect(rankedKeywordsPath()).toBe("/dataforseo_labs/google/ranked_keywords/live");
  });
});
