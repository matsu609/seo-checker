/**
 * Business Profile Performance API: 応答の解析・月次の集計（純関数）と、呼び出しの形（URL・エラー）。
 */
import { describe, expect, it, vi } from "vitest";
import { GoogleLinkError } from "../errors";
import {
  buildDailyMetricsUrl,
  buildPerformanceSummary,
  buildSearchKeywordsUrl,
  compareKeywords,
  defaultReportMonth,
  endOfMonth,
  fetchPerformanceSummary,
  parseDailyMetrics,
  parseSearchKeywords,
  shiftMonth,
  summarizeMonthly,
  toPerformanceLocationName,
} from "../performance";

const DAILY = {
  multiDailyMetricTimeSeries: [
    {
      dailyMetricTimeSeries: [
        {
          dailyMetric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS",
          timeSeries: { datedValues: [{ date: { year: 2026, month: 8, day: 1 }, value: "100" }, { date: { year: 2026, month: 8, day: 2 } }, { date: { year: 2026, month: 7, day: 31 }, value: "5" }] },
        },
        { dailyMetric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", timeSeries: { datedValues: [{ date: { year: 2026, month: 8, day: 1 }, value: "40" }] } },
        { dailyMetric: "CALL_CLICKS", timeSeries: { datedValues: [{ date: { year: 2026, month: 8, day: 3 }, value: 2 }] } },
        { dailyMetric: "UNKNOWN_METRIC", timeSeries: { datedValues: [{ date: { year: 2026, month: 8, day: 3 }, value: 99 }] } },
      ],
    },
  ],
};

describe("月の計算", () => {
  it("YYYY-MM をずらす・末日・既定の当月は先月", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-08", -17)).toBe("2025-03");
    expect(endOfMonth("2026-02")).toBe("2026-02-28");
    expect(endOfMonth("2028-02")).toBe("2028-02-29");
    expect(defaultReportMonth(new Date("2026-09-17T00:00:00Z"))).toBe("2026-08");
    expect(defaultReportMonth(new Date("2026-01-03T00:00:00Z"))).toBe("2025-12");
  });

  it("場所の名前は locations/{id} に揃える", () => {
    expect(toPerformanceLocationName("accounts/1/locations/22")).toBe("locations/22");
    expect(toPerformanceLocationName("locations/22")).toBe("locations/22");
    expect(toPerformanceLocationName("22")).toBe("locations/22");
    expect(toPerformanceLocationName("bad id!")).toBeNull();
  });
});

describe("URL", () => {
  it("日次指標: 全指標と期間を渡す", () => {
    const url = buildDailyMetricsUrl("https://x", "locations/22", "2025-03-01", "2026-08-31");
    expect(url.startsWith("https://x/locations/22:fetchMultiDailyMetricsTimeSeries?")).toBe(true);
    expect(url).toContain("dailyMetrics=BUSINESS_IMPRESSIONS_MOBILE_MAPS");
    expect(url).toContain("dailyMetrics=WEBSITE_CLICKS");
    expect(url).toContain("dailyRange.startDate.year=2025");
    expect(url).toContain("dailyRange.startDate.month=3");
    expect(url).toContain("dailyRange.endDate.day=31");
  });

  it("検索キーワード: 1 か月ぶん・ページトークン", () => {
    const url = buildSearchKeywordsUrl("https://x", "locations/22", "2026-08", "tok");
    expect(url).toContain("/locations/22/searchkeywords/impressions/monthly?");
    expect(url).toContain("monthlyRange.startMonth.year=2026");
    expect(url).toContain("monthlyRange.endMonth.month=8");
    expect(url).toContain("pageToken=tok");
  });
});

describe("応答の解析", () => {
  it("日次指標: 知らない指標は捨て、値の無い日は 0", () => {
    const points = parseDailyMetrics(DAILY);
    expect(points).toEqual([
      { metric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", date: "2026-08-01", value: 100 },
      { metric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", date: "2026-08-02", value: 0 },
      { metric: "BUSINESS_IMPRESSIONS_MOBILE_MAPS", date: "2026-07-31", value: 5 },
      { metric: "BUSINESS_IMPRESSIONS_DESKTOP_SEARCH", date: "2026-08-01", value: 40 },
      { metric: "CALL_CLICKS", date: "2026-08-03", value: 2 },
    ]);
    expect(parseDailyMetrics(null)).toEqual([]);
  });

  it("検索キーワード: 丸められた語（threshold）は近似として持つ。多い順", () => {
    const { keywords, nextPageToken } = parseSearchKeywords({
      searchKeywordsCounts: [
        { searchKeyword: "原宿 キーホルダー", insightsValue: { value: "120" } },
        { searchKeyword: "キーホルダー 東京", insightsValue: { threshold: "15" } },
        { searchKeyword: "", insightsValue: { value: "1" } },
        { searchKeyword: "no value" },
      ],
      nextPageToken: "next",
    });
    expect(keywords).toEqual([
      { keyword: "原宿 キーホルダー", impressions: 120, approximate: false },
      { keyword: "キーホルダー 東京", impressions: 15, approximate: true },
    ]);
    expect(nextPageToken).toBe("next");
  });
});

describe("集計", () => {
  it("月ごとの合計。表示回数はマップ + 検索の合計も持つ。データの無い月は hasData: false", () => {
    const rows = summarizeMonthly(parseDailyMetrics(DAILY), "2026-06", "2026-08");
    expect(rows.map((r) => r.month)).toEqual(["2026-08", "2026-07", "2026-06"]);
    expect(rows[0]!.totals).toMatchObject({ impressionsMaps: 100, impressionsSearch: 40, impressions: 140, calls: 2 });
    expect(rows[1]!.totals).toMatchObject({ impressionsMaps: 5, impressions: 5 });
    expect(rows[2]!.hasData).toBe(false);
  });

  it("キーワードの前月比と、伸びた / 落ちた TOP3（近似の語は除く）", () => {
    const current = [
      { keyword: "a", impressions: 100, approximate: false },
      { keyword: "b", impressions: 10, approximate: false },
      { keyword: "c", impressions: 50, approximate: false },
      { keyword: "d", impressions: 15, approximate: true },
    ];
    const previous = [
      { keyword: "a", impressions: 60, approximate: false },
      { keyword: "b", impressions: 40, approximate: false },
      { keyword: "z", impressions: 5, approximate: false },
    ];
    const r = compareKeywords(current, previous);
    expect(r.keywords.map((k) => k.keyword)).toEqual(["a", "c", "d", "b", "z"]);
    expect(r.keywords.find((k) => k.keyword === "z")).toMatchObject({ current: null, previous: 5, delta: null });
    expect(r.risers.map((k) => [k.keyword, k.delta])).toEqual([["a", 40]]);
    expect(r.fallers.map((k) => [k.keyword, k.delta])).toEqual([["b", -30]]);
  });

  it("月次レポート一式", () => {
    const s = buildPerformanceSummary("2026-08", parseDailyMetrics(DAILY), [{ keyword: "a", impressions: 3, approximate: false }], [], 3);
    expect(s.previousMonth).toBe("2026-07");
    expect(s.months).toHaveLength(3);
    expect(s.current.impressions).toBe(140);
    expect(s.previous.impressions).toBe(5);
    expect(s.actions).toEqual({ current: 2, previous: 0 });
    expect(s.keywords).toHaveLength(1);
  });
});

describe("呼び出し", () => {
  it("3 本のリクエスト（日次 18 か月・当月と前月のキーワード）を Bearer 付きで投げ、まとめて返す", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(String(url));
      expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
      const u = String(url);
      if (u.includes("fetchMultiDailyMetricsTimeSeries")) return new Response(JSON.stringify(DAILY), { status: 200 });
      if (u.includes("startMonth.month=8")) return new Response(JSON.stringify({ searchKeywordsCounts: [{ searchKeyword: "a", insightsValue: { value: "3" } }] }), { status: 200 });
      return new Response(JSON.stringify({ searchKeywordsCounts: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    const s = await fetchPerformanceSummary("accounts/1/locations/22", "2026-08", { fetchImpl, getToken: async () => "tok", endpoint: "https://x" });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("/locations/22:fetchMultiDailyMetricsTimeSeries?");
    expect(calls[0]).toContain("dailyRange.startDate.year=2025");
    expect(s.current.impressions).toBe(140);
    expect(s.keywords[0]?.keyword).toBe("a");
  });

  it("403 は API 未承認の案内、401 は再接続の案内", async () => {
    const forbidden = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    await expect(fetchPerformanceSummary("locations/1", "2026-08", { fetchImpl: forbidden, getToken: async () => "t" })).rejects.toMatchObject({ code: "forbidden" });
    const unauthorized = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch;
    const err = await fetchPerformanceSummary("locations/1", "2026-08", { fetchImpl: unauthorized, getToken: async () => "t" }).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleLinkError);
    expect(err.code).toBe("not_connected");
  });
});
