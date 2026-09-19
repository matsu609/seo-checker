/**
 * Core Web Vitals の判定。3 指標がそろわないサイトでも「判定不能」にせず、取れた指標で判定することを固定する。
 */
import { describe, expect, it } from "vitest";
import { cwvVerdict } from "../parse";


describe("Core Web Vitals の判定（取れた指標だけで判定する）", () => {
  const metric = (p75: number, status: "good" | "needs-improvement" | "poor") => ({ p75, status, histogram: [0.8, 0.1, 0.1] as [number, number, number] });
  const base = { scope: "origin" as const, key: "https://example.jp", period: { firstDate: "2026-08-01", lastDate: "2026-08-28" } };

  it("3 指標がそろえば最も悪い状態が判定", () => {
    const v = cwvVerdict({ ...base, metrics: { lcp: metric(1100, "good"), inp: metric(150, "good"), cls: metric(0.3, "poor") }, passesCoreWebVitals: false });
    expect(v.label).toBe("不良");
    expect(v.complete).toBe(true);
    expect(v.missing).toEqual([]);
  });

  it("LCP しか無ければ LCP で判定し、足りない指標を note に書く（判定不能にしない）", () => {
    const v = cwvVerdict({ ...base, metrics: { lcp: metric(1100, "good") }, passesCoreWebVitals: null });
    expect(v.label).toBe("良好");
    expect(v.complete).toBe(false);
    expect(v.missing).toEqual(["inp", "cls"]);
    expect(v.note).toContain("INP・CLS はデータ不足");
    expect(v.note).toContain("LCP で判定");
  });

  it("指標が 1 つも無ければ判定不能", () => {
    expect(cwvVerdict({ ...base, metrics: {}, passesCoreWebVitals: null }).label).toBe("判定不能");
    expect(cwvVerdict(null).label).toBe("判定不能");
  });
});
