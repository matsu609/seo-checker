import { afterEach, describe, expect, it } from "vitest";
import { fetchCruxWithFallback } from "../client";
import { formatCrux, parseCruxHistory, parseCruxRecord, statusOf, trendOf } from "../parse";

const RECORD = {
  record: {
    key: { origin: "https://example.test" },
    metrics: {
      largest_contentful_paint: { histogram: [{ density: 0.7 }, { density: 0.2 }, { density: 0.1 }], percentiles: { p75: 2800 } },
      interaction_to_next_paint: { histogram: [{ density: 0.9 }, { density: 0.08 }, { density: 0.02 }], percentiles: { p75: 150 } },
      cumulative_layout_shift: { histogram: [{ density: 0.95 }, { density: 0.04 }, { density: 0.01 }], percentiles: { p75: "0.05" } },
      experimental_time_to_first_byte: { histogram: [], percentiles: { p75: 900 } },
    },
    collectionPeriod: { firstDate: { year: 2026, month: 8, day: 10 }, lastDate: { year: 2026, month: 9, day: 6 } },
  },
};

describe("CrUX の応答の解釈", () => {
  it("p75 と区分と集計期間を読む（CLS は文字列でも可）", () => {
    const r = parseCruxRecord(RECORD)!;
    expect(r.scope).toBe("origin");
    expect(r.key).toBe("https://example.test");
    expect(r.metrics.lcp).toEqual({ p75: 2800, status: "needs-improvement", histogram: [0.7, 0.2, 0.1] });
    expect(r.metrics.inp?.status).toBe("good");
    expect(r.metrics.cls).toMatchObject({ p75: 0.05, status: "good" });
    expect(r.metrics.ttfb?.status).toBe("needs-improvement");
    expect(r.metrics.fcp).toBeUndefined();
    expect(r.period).toEqual({ firstDate: "2026-08-10", lastDate: "2026-09-06" });
    // LCP が改善が必要なので CWV は不合格
    expect(r.passesCoreWebVitals).toBe(false);
  });

  it("3 指標がそろわなければ CWV の合否は null", () => {
    const r = parseCruxRecord({ record: { key: { url: "https://example.test/a" }, metrics: { largest_contentful_paint: { percentiles: { p75: 1000 } } } } })!;
    expect(r.scope).toBe("url");
    expect(r.passesCoreWebVitals).toBeNull();
    expect(parseCruxRecord({})).toBeNull();
  });

  it("区分の境界", () => {
    expect(statusOf("lcp", 2500)).toBe("good");
    expect(statusOf("lcp", 2501)).toBe("needs-improvement");
    expect(statusOf("lcp", 4001)).toBe("poor");
    expect(statusOf("cls", 0.1)).toBe("good");
    expect(statusOf("inp", 600)).toBe("poor");
    expect(formatCrux("lcp", 2800)).toBe("2.8 秒");
    expect(formatCrux("cls", 0.05)).toBe("0.05");
  });

  it("推移は期間の終了日と p75 の列にする", () => {
    const h = parseCruxHistory({
      record: {
        key: { origin: "https://example.test" },
        collectionPeriods: [
          { firstDate: { year: 2026, month: 7, day: 1 }, lastDate: { year: 2026, month: 7, day: 28 } },
          { firstDate: { year: 2026, month: 7, day: 8 }, lastDate: { year: 2026, month: 8, day: 4 } },
          { firstDate: { year: 2026, month: 7, day: 15 }, lastDate: { year: 2026, month: 8, day: 11 } },
        ],
        metrics: {
          largest_contentful_paint: { percentilesTimeseries: { p75s: [3100, null, 2400] } },
          cumulative_layout_shift: { percentilesTimeseries: { p75s: [null, null, null] } },
        },
      },
    })!;
    expect(h.metrics.lcp).toEqual([
      { date: "2026-07-28", p75: 3100 },
      { date: "2026-08-04", p75: null },
      { date: "2026-08-11", p75: 2400 },
    ]);
    expect(h.metrics.cls).toBeUndefined();
    expect(trendOf(h.metrics.lcp)).toEqual({ first: 3100, last: 2400, firstDate: "2026-07-28", lastDate: "2026-08-11" });
    expect(trendOf([{ date: "x", p75: 1 }])).toBeNull();
  });
});

describe("URL → Origin のフォールバック", () => {
  const original = process.env.PAGESPEED_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.PAGESPEED_API_KEY;
    else process.env.PAGESPEED_API_KEY = original;
  });

  it("URL 単位が 404 なら Origin 単位を取りに行く", async () => {
    process.env.PAGESPEED_API_KEY = "test-key";
    const calls: string[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>;
      calls.push(body.url ?? body.origin);
      if (body.url) return new Response("not found", { status: 404 });
      return Response.json(RECORD);
    }) as typeof fetch;
    const outcome = await fetchCruxWithFallback("https://fallback.example.test/page", { fetchImpl });
    expect(calls).toEqual(["https://fallback.example.test/page", "https://fallback.example.test"]);
    expect(outcome.result?.scope).toBe("origin");
  });

  it("キーが無ければ no-key", async () => {
    delete process.env.PAGESPEED_API_KEY;
    delete process.env.CRUX_API_KEY;
    const outcome = await fetchCruxWithFallback("https://nokey.example.test/", {});
    expect(outcome.failure).toBe("no-key");
  });
});
