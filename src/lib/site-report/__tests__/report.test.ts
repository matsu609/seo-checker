/**
 * GA4 リクエストの組み立てと応答の読み取り（ネットワークには出ない。Ga4Client を差し替える）。
 */
import { describe, expect, it } from "vitest";
import type { Ga4Client, Ga4Report, Ga4RunReportBody } from "@/lib/ga4/types";
import {
  CURRENT_RANGE_NAME,
  PREVIOUS_RANGE_NAME,
  buildChannelRequest,
  buildKpiRequest,
  buildOrganicRequest,
  fetchSiteReport,
  parseChannelReport,
  parseKpiReport,
  parseOrganicReport,
  rangeKeyOf,
} from "../report";

const RANGE = { startDate: "2026-08-11", endDate: "2026-09-07" };
const PREVIOUS = { startDate: "2026-07-14", endDate: "2026-08-10" };

function report(partial: Partial<Ga4Report>): Ga4Report {
  return { dimensionHeaders: [], metricHeaders: [], rows: [], rowCount: 0, ...partial };
}

/** 呼ばれたリクエストを記録するだけのクライアント */
function stubClient(reports: Ga4Report[]): { client: Ga4Client; bodies: Ga4RunReportBody[] } {
  const bodies: Ga4RunReportBody[] = [];
  let i = 0;
  return {
    bodies,
    client: {
      propertyId: "123456",
      async runReport(body) {
        bodies.push(body);
        return reports[i++] ?? report({});
      },
    },
  };
}

describe("リクエストの組み立て", () => {
  it("KPI は 2 期間を 1 リクエストで投げる", () => {
    const body = buildKpiRequest(RANGE, PREVIOUS);
    expect(body.dateRanges).toEqual([
      { ...RANGE, name: CURRENT_RANGE_NAME },
      { ...PREVIOUS, name: PREVIOUS_RANGE_NAME },
    ]);
    expect(body.metrics?.map((m) => m.name)).toEqual([
      "totalUsers",
      "newUsers",
      "userEngagementDuration",
      "activeUsers",
      "engagementRate",
      "keyEvents",
    ]);
    expect(body.dimensions).toBeUndefined();
  });

  it("自然検索セッションはチャネルで絞る", () => {
    const body = buildOrganicRequest(RANGE, PREVIOUS);
    expect(body.dateRanges).toHaveLength(2);
    expect(body.dimensionFilter?.filter?.fieldName).toBe("sessionDefaultChannelGroup");
    expect(body.dimensionFilter?.filter?.stringFilter?.value).toBe("Organic Search");
    expect(body.metrics?.map((m) => m.name)).toEqual(["sessions"]);
  });

  it("チャネル別時系列は当期だけ・日付順", () => {
    const body = buildChannelRequest(RANGE);
    expect(body.dateRanges).toEqual([RANGE]);
    expect(body.dimensions?.map((d) => d.name)).toEqual(["date", "sessionDefaultChannelGroup"]);
    expect(body.limit).toBeGreaterThan(0);
  });
});

describe("rangeKeyOf", () => {
  it("名前でも date_range_N でも読める", () => {
    expect(rangeKeyOf("current")).toBe("current");
    expect(rangeKeyOf("previous")).toBe("previous");
    expect(rangeKeyOf("date_range_0")).toBe("current");
    expect(rangeKeyOf("date_range_1")).toBe("previous");
    expect(rangeKeyOf("なにか")).toBeNull();
  });
});

describe("応答の読み取り", () => {
  const kpiReport = report({
    dimensionHeaders: ["dateRange"],
    metricHeaders: ["totalUsers", "newUsers", "userEngagementDuration", "activeUsers", "engagementRate", "keyEvents"],
    // 順序をわざと入れ替えて、dateRange で引けていることを確かめる
    rows: [
      { dimensionValues: ["previous"], metricValues: ["58815", "39055", "74040", "10000", "0.6076", "271"] },
      { dimensionValues: ["current"], metricValues: ["63941", "39792", "86500", "10000", "0.6029", "303"] },
    ],
    rowCount: 2,
  });

  it("KPI は期間ごとに読み分ける", () => {
    const { current, previous } = parseKpiReport(kpiReport);
    expect(current.totalUsers).toBe(63_941);
    expect(current.keyEvents).toBe(303);
    expect(previous.totalUsers).toBe(58_815);
    expect(previous.engagementRate).toBeCloseTo(0.6076, 6);
    // 自然検索セッションは別リクエストなのでここでは 0
    expect(current.organicSessions).toBe(0);
  });

  it("行が無い期間は 0 になる（欠損で落ちない）", () => {
    const { current, previous } = parseKpiReport(report({ dimensionHeaders: ["dateRange"], metricHeaders: ["totalUsers"] }));
    expect(current.totalUsers).toBe(0);
    expect(previous.totalUsers).toBe(0);
  });

  it("自然検索セッションを期間ごとに読む", () => {
    const organic = parseOrganicReport(
      report({
        dimensionHeaders: ["dateRange"],
        metricHeaders: ["sessions"],
        rows: [
          { dimensionValues: ["current"], metricValues: ["42208"] },
          { dimensionValues: ["previous"], metricValues: ["35822"] },
        ],
        rowCount: 2,
      }),
    );
    expect(organic).toEqual({ current: 42_208, previous: 35_822 });
  });

  it("日 × チャネルを素の行にする（GA4 の YYYYMMDD を ISO に直す）", () => {
    const rows = parseChannelReport(
      report({
        dimensionHeaders: ["date", "sessionDefaultChannelGroup"],
        metricHeaders: ["sessions", "totalUsers"],
        rows: [
          { dimensionValues: ["20260901", "Organic Search"], metricValues: ["120", "90"] },
          { dimensionValues: ["", "Direct"], metricValues: ["5", "5"] },
        ],
        rowCount: 2,
      }),
    );
    expect(rows).toEqual([
      { date: "2026-09-01", channel: "Organic Search", sessions: 120, users: 90 },
    ]);
  });
});

describe("fetchSiteReport", () => {
  it("3 本の runReport を投げ、1 つのレスポンスにまとめる", async () => {
    const { client, bodies } = stubClient([
      report({
        dimensionHeaders: ["dateRange"],
        metricHeaders: ["totalUsers"],
        rows: [
          { dimensionValues: ["current"], metricValues: ["100"] },
          { dimensionValues: ["previous"], metricValues: ["80"] },
        ],
        rowCount: 2,
      }),
      report({
        dimensionHeaders: ["dateRange"],
        metricHeaders: ["sessions"],
        rows: [
          { dimensionValues: ["current"], metricValues: ["70"] },
          { dimensionValues: ["previous"], metricValues: ["60"] },
        ],
        rowCount: 2,
      }),
      report({
        dimensionHeaders: ["date", "sessionDefaultChannelGroup"],
        metricHeaders: ["sessions", "totalUsers"],
        rows: [{ dimensionValues: ["20260901", "Direct"], metricValues: ["10", "9"] }],
        rowCount: 1,
      }),
    ]);

    const result = await fetchSiteReport(client, { range: RANGE, now: new Date("2026-09-08T00:00:00.000Z") });
    expect(bodies).toHaveLength(3);
    // 前期を渡さなければ「同じ日数だけ直前」
    expect(result.previousRange).toEqual(PREVIOUS);
    expect(result.current.totalUsers).toBe(100);
    expect(result.current.organicSessions).toBe(70);
    expect(result.previous.organicSessions).toBe(60);
    expect(result.channels).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(result.fetchedAt).toBe("2026-09-08T00:00:00.000Z");
  });
});
