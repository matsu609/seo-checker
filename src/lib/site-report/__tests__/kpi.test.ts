/**
 * KPI カードの前期比（§18.1）。0 除算と「0 → 正」を 0% と混同しないことが要。
 */
import { describe, expect, it } from "vitest";
import {
  buildKpis,
  compareValues,
  formatDuration,
  formatKpiValue,
  formatRatio,
  metricValue,
  SITE_KPIS,
} from "../kpi";
import type { SiteMetrics } from "../types";

const CURRENT: SiteMetrics = {
  totalUsers: 63_941,
  newUsers: 39_792,
  userEngagementDuration: 86_500,
  activeUsers: 10_000,
  engagementRate: 0.6029,
  keyEvents: 303,
  organicSessions: 42_208,
};

const PREVIOUS: SiteMetrics = {
  totalUsers: 58_815,
  newUsers: 39_055,
  userEngagementDuration: 74_040,
  activeUsers: 10_000,
  engagementRate: 0.6076,
  keyEvents: 271,
  organicSessions: 35_822,
};

describe("compareValues", () => {
  it("前期が正なら増減率を出す", () => {
    const c = compareValues(63_941, 58_815);
    expect(c.delta).toBe(5126);
    expect(c.direction).toBe("up");
    expect(c.ratio).toBeCloseTo(0.0872, 4);
  });

  it("減少は負の増減率と down", () => {
    const c = compareValues(0.6029, 0.6076);
    expect(c.direction).toBe("down");
    expect(c.ratio).toBeLessThan(0);
    expect(c.ratio).toBeCloseTo(-0.0077, 4);
  });

  it("前期が 0 で当期が正なら増減率は計算できない（null）", () => {
    const c = compareValues(120, 0);
    expect(c.delta).toBe(120);
    expect(c.direction).toBe("up");
    expect(c.ratio).toBeNull();
  });

  it("両方 0 なら変化なし（ratio 0）", () => {
    const c = compareValues(0, 0);
    expect(c.delta).toBe(0);
    expect(c.direction).toBe("flat");
    expect(c.ratio).toBe(0);
  });

  it("当期が 0 で前期が正なら −100%", () => {
    const c = compareValues(0, 50);
    expect(c.direction).toBe("down");
    expect(c.ratio).toBe(-1);
  });

  it("同じ値なら flat", () => {
    expect(compareValues(10, 10).direction).toBe("flat");
    expect(compareValues(10, 10).ratio).toBe(0);
  });

  it("NaN / Infinity は 0 として扱う", () => {
    const c = compareValues(Number.NaN, Number.POSITIVE_INFINITY);
    expect(c.current).toBe(0);
    expect(c.previous).toBe(0);
    expect(c.ratio).toBe(0);
  });
});

describe("metricValue", () => {
  it("平均エンゲージメント時間は userEngagementDuration ÷ activeUsers", () => {
    expect(metricValue(CURRENT, "engagementTime")).toBeCloseTo(8.65, 6);
  });

  it("activeUsers が 0 の期間は 0（ゼロ除算しない）", () => {
    expect(metricValue({ ...CURRENT, activeUsers: 0 }, "engagementTime")).toBe(0);
  });

  it("自然検索セッションとコンバージョンをそのまま返す", () => {
    expect(metricValue(CURRENT, "organicSessions")).toBe(42_208);
    expect(metricValue(CURRENT, "keyEvents")).toBe(303);
  });
});

describe("buildKpis", () => {
  it("6 枚のカードを定義順に作る", () => {
    const kpis = buildKpis(CURRENT, PREVIOUS);
    expect(kpis.map((k) => k.id)).toEqual(SITE_KPIS.map((k) => k.id));
    expect(kpis).toHaveLength(6);
  });

  it("自然検索セッションの増減率が仕様の例（+17.8%）と一致する", () => {
    const kpis = buildKpis(CURRENT, PREVIOUS);
    const organic = kpis.find((k) => k.id === "organicSessions");
    expect(organic?.comparison.ratio).toBeCloseTo(0.1783, 4);
    expect(organic?.comparison.direction).toBe("up");
  });

  it("エンゲージメント率は微減で down になる", () => {
    const rate = buildKpis(CURRENT, PREVIOUS).find((k) => k.id === "engagementRate");
    expect(rate?.comparison.direction).toBe("down");
  });

  it("前期のデータが無ければ増減率は null", () => {
    const zero: SiteMetrics = {
      totalUsers: 0,
      newUsers: 0,
      userEngagementDuration: 0,
      activeUsers: 0,
      engagementRate: 0,
      keyEvents: 0,
      organicSessions: 0,
    };
    const kpis = buildKpis(CURRENT, zero);
    expect(kpis.find((k) => k.id === "users")?.comparison.ratio).toBeNull();
    // 当期も 0 の指標は「変化なし」
    expect(buildKpis(zero, zero).every((k) => k.comparison.ratio === 0)).toBe(true);
  });
});

describe("表示の書式", () => {
  it("秒 → 分秒", () => {
    expect(formatDuration(42)).toBe("42秒");
    expect(formatDuration(65)).toBe("1分05秒");
    expect(formatDuration(0)).toBe("0秒");
  });

  it("整数 / 率 / 時間の書式", () => {
    expect(formatKpiValue("integer", 63_941)).toBe("63,941");
    expect(formatKpiValue("percent", 0.6029)).toBe("60.3%");
    expect(formatKpiValue("duration", 8.65)).toBe("9秒");
  });

  it("増減率は符号付き、計算できないときは —", () => {
    expect(formatRatio(0.0872)).toBe("+8.7%");
    expect(formatRatio(-0.008)).toBe("−0.8%");
    expect(formatRatio(0)).toBe("±0.0%");
    expect(formatRatio(null)).toBe("—");
  });
});
