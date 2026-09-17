import { describe, expect, it } from "vitest";
import { buildReport, buildSessions, daysBetween, shiftDay } from "../aggregate";
import type { TrackingRow } from "../types";

function row(partial: Partial<TrackingRow> & { ts: string }): TrackingRow {
  return {
    day: partial.ts.slice(0, 10),
    visitor: "v1",
    type: "pageview",
    path: "/",
    referrer_host: "",
    channel: "direct",
    source: "",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    device: "mobile",
    kind: "",
    seconds: 0,
    scroll: 0,
    ...partial,
  };
}

describe("セッションの束ね方", () => {
  it("30 分以内は同じセッション、あいたら別", () => {
    const rows = [
      row({ ts: "2026-09-10T01:00:00Z", channel: "search", source: "Google" }),
      row({ ts: "2026-09-10T01:10:00Z", path: "/a", channel: "internal" }),
      row({ ts: "2026-09-10T03:00:00Z", path: "/b" }),
    ];
    const sessions = buildSessions(rows);
    expect(sessions).toHaveLength(2);
    expect(sessions[0].pageviews).toBe(2);
    expect(sessions[0].channel).toBe("search");
    expect(sessions[1].channel).toBe("direct");
  });

  it("internal で始まる（前のセッションの続き）は direct に倒す", () => {
    const sessions = buildSessions([row({ ts: "2026-09-10T01:00:00Z", channel: "internal", source: "" })]);
    expect(sessions[0].channel).toBe("direct");
  });

  it("CV はそのセッションの範囲（最後のページビュー + 30 分）に入るものだけ", () => {
    const rows = [
      row({ ts: "2026-09-10T01:00:00Z" }),
      row({ ts: "2026-09-10T01:05:00Z", type: "click", kind: "tel" }),
      row({ ts: "2026-09-10T05:00:00Z", type: "form", kind: "form" }), // セッション外
    ];
    const sessions = buildSessions(rows);
    expect(sessions).toHaveLength(1);
    expect([...sessions[0].conversions]).toEqual(["tel"]);
  });
});

describe("報告書", () => {
  const rows = [
    row({ ts: "2026-09-10T01:00:00Z", visitor: "a", channel: "ai", source: "ChatGPT" }),
    row({ ts: "2026-09-10T01:02:00Z", visitor: "a", type: "leave", seconds: 40, scroll: 80 }),
    row({ ts: "2026-09-10T01:03:00Z", visitor: "a", type: "click", kind: "mail" }),
    row({ ts: "2026-09-11T01:00:00Z", visitor: "b", path: "/menu", channel: "search", source: "Google", device: "desktop" }),
    row({ ts: "2026-09-11T01:01:00Z", visitor: "b", path: "/menu", type: "leave", seconds: 20 }),
    row({ ts: "2026-09-11T02:00:00Z", visitor: "c", path: "/", channel: "referral", source: "blog.example.com" }),
  ];
  const previousRows = [row({ ts: "2026-09-05T01:00:00Z", visitor: "z" })];
  const report = buildReport({ rows, previousRows, from: "2026-09-10", to: "2026-09-11" });

  it("合計と前期", () => {
    expect(report.totals).toMatchObject({ visitors: 3, sessions: 3, pageviews: 3, avgSeconds: 30, convertedSessions: 1, aiSessions: 1 });
    expect(report.totals.conversions).toEqual({ tel: 0, mail: 1, external: 0, form: 0 });
    expect(report.previous.pageviews).toBe(1);
    expect(report.previousRange).toEqual({ from: "2026-09-08", to: "2026-09-09" });
  });

  it("日別は期間の全日を埋める（無い日は 0）", () => {
    expect(report.daily.map((d) => d.day)).toEqual(["2026-09-10", "2026-09-11"]);
    expect(report.daily[0]).toEqual({ day: "2026-09-10", visitors: 1, sessions: 1, pageviews: 1, conversions: 1 });
    expect(report.daily[1].sessions).toBe(2);
  });

  it("ページ・流入元・AI の内訳・参照元・端末", () => {
    expect(report.pages.map((p) => p.path)).toEqual(["/", "/menu"]);
    expect(report.pages[0]).toMatchObject({ pageviews: 2, visitors: 2, avgSeconds: 40, conversions: 1 });
    expect(report.channels.map((c) => [c.channel, c.sessions])).toEqual([
      ["search", 1],
      ["ai", 1],
      ["referral", 1],
    ]);
    expect(report.aiSources).toEqual([{ name: "ChatGPT", sessions: 1 }]);
    expect(report.referrers).toEqual([{ name: "blog.example.com", sessions: 1 }]);
    expect(report.devices).toEqual({ mobile: 2, desktop: 1 });
  });

  it("空でも壊れない", () => {
    const empty = buildReport({ rows: [], previousRows: [], from: "2026-09-10", to: "2026-09-10" });
    expect(empty.totals.avgSeconds).toBeNull();
    expect(empty.channels).toEqual([]);
    expect(empty.daily).toHaveLength(1);
  });
});

describe("日付の道具", () => {
  it("daysBetween / shiftDay", () => {
    expect(daysBetween("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
  });
});
