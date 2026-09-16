import { describe, expect, it } from "vitest";
import type { Ga4Client } from "@/lib/ga4";
import type { SearchConsoleClient } from "@/lib/google/search-console/types";
import { collectGoogle, siteMatchesOrigin } from "../google";

describe("Google 連携の層", () => {
  it("連携先のサイトが分析対象と同じか", () => {
    expect(siteMatchesOrigin("sc-domain:example.test", "https://www.example.test")).toBe(true);
    expect(siteMatchesOrigin("https://example.test/", "https://example.test")).toBe(true);
    expect(siteMatchesOrigin("https://other.test/", "https://example.test")).toBe(false);
    expect(siteMatchesOrigin("sc-domain:example.test", "https://notexample.test")).toBe(false);
  });

  it("未連携なら空と注記", async () => {
    const { google, searchConsole, ga4 } = await collectGoogle("https://example.test", { getSettings: async () => ({}), ga4: async () => null });
    expect(searchConsole).toBe(false);
    expect(ga4).toBe(false);
    expect(google.notes.join(" ")).toContain("Search Console は連携していません");
    expect(google.notes.join(" ")).toContain("GA4 は連携していません");
  });

  it("GA4 の生データも返す（診断ルールが使う）", async () => {
    const { ga4Dataset, gscDataset } = await collectGoogle("https://example.test", { getSettings: async () => ({}), ga4: async () => null });
    expect(ga4Dataset).toBeNull();
    expect(gscDataset).toBeNull();
  });

  it("連携済みなら 28 日の合計・上位クエリ・自然検索の流入を集める", async () => {
    const sc: SearchConsoleClient = {
      async listSites() {
        return [];
      },
      async query(_site, q) {
        if (q.dimensions?.[0] === "query") return [{ keys: ["ウェブ制作"], clicks: 10, impressions: 200, ctr: 0.05, position: 8.2 }];
        if (q.dimensions?.[0] === "page") return [{ keys: ["https://example.test/service"], clicks: 7, impressions: 100, ctr: 0.07, position: 5.1 }];
        return [{ keys: [], clicks: 30, impressions: 900, ctr: 0.033, position: 12.5 }];
      },
    };
    // セッション指標の並びは collectGa4Dataset が投げるものに合わせる
    const SESSION_HEADERS = ["sessions", "totalUsers", "newUsers", "engagedSessions", "keyEvents", "userEngagementDuration"];
    const ga4Client: Ga4Client = {
      propertyId: "123",
      async runReport(body) {
        const dimension = body.dimensions?.[0]?.name;
        if (dimension === "landingPage") {
          return {
            dimensionHeaders: ["landingPage"],
            metricHeaders: SESSION_HEADERS,
            rows: [{ dimensionValues: ["/service"], metricValues: ["40", "35", "20", "30", "3", "1200"] }],
            rowCount: 1,
          };
        }
        if (dimension === "sessionDefaultChannelGroup" && body.dimensions?.[1]?.name === "eventName") {
          return { dimensionHeaders: ["sessionDefaultChannelGroup", "eventName"], metricHeaders: ["sessions"], rows: [{ dimensionValues: ["Organic Search", "generate_lead"], metricValues: ["4"] }], rowCount: 1 };
        }
        if (dimension === "eventName") {
          return {
            dimensionHeaders: ["eventName"],
            metricHeaders: ["eventCount", "totalUsers", "sessions", "keyEvents"],
            rows: [
              { dimensionValues: ["page_view"], metricValues: ["400", "120", "150", "0"] },
              { dimensionValues: ["contact_click"], metricValues: ["20", "18", "18", "0"] },
              { dimensionValues: ["generate_lead"], metricValues: ["7", "7", "7", "7"] },
            ],
            rowCount: 3,
          };
        }
        if (dimension === "pagePath") {
          return { dimensionHeaders: ["pagePath", "pageTitle"], metricHeaders: ["screenPageViews", "totalUsers", "userEngagementDuration"], rows: [{ dimensionValues: ["/service", "サービス"], metricValues: ["200", "100", "6000"] }], rowCount: 1 };
        }
        if (dimension === "sessionSourceMedium" || dimension === "deviceCategory") {
          return { dimensionHeaders: [dimension], metricHeaders: SESSION_HEADERS, rows: [{ dimensionValues: [dimension === "deviceCategory" ? "mobile" : "google / organic"], metricValues: ["150", "120", "90", "95", "7", "4500"] }], rowCount: 1 };
        }
        return {
          dimensionHeaders: ["sessionDefaultChannelGroup"],
          metricHeaders: SESSION_HEADERS,
          rows: [
            { dimensionValues: ["Organic Search"], metricValues: ["100", "80", "60", "60", "5", "3000"] },
            { dimensionValues: ["Direct"], metricValues: ["50", "40", "30", "25", "2", "1500"] },
          ],
          rowCount: 2,
        };
      },
    };
    const { google, searchConsole, ga4 } = await collectGoogle("https://example.test", {
      getSettings: async () => ({ searchConsoleSiteUrl: "sc-domain:example.test", ga4PropertyId: "123" }),
      searchConsole: () => sc,
      ga4: async () => ({ client: ga4Client }),
      now: new Date("2026-09-14T00:00:00Z"),
    });
    expect(searchConsole).toBe(true);
    expect(ga4).toBe(true);
    expect(google.searchConsole?.totals).toMatchObject({ clicks: 30, impressions: 900, position: 12.5 });
    expect(google.searchConsole?.totals.ctr).toBeCloseTo(30 / 900, 4);
    expect(google.searchConsole?.queries[0].query).toBe("ウェブ制作");
    // エンゲージメント率は engagedSessions ÷ sessions（行ごとの率の平均ではない）
    expect(google.ga4?.organic).toEqual({ sessions: 100, users: 80, engagementRate: 0.6, keyEvents: 5 });
    expect(google.ga4?.all).toEqual({ sessions: 150, keyEvents: 7 });
    expect(google.ga4?.landing[0]).toEqual({ page: "/service", sessions: 40, keyEvents: 3 });
  });
});
