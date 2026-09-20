import { describe, expect, it } from "vitest";
import { buildMonthlyReport, reportMailText, suggestActions, type ReportSources } from "../build";

const now = new Date("2026-10-01T00:00:00Z");
const base: ReportSources = {
  siteDomain: "example.jp",
  rank: null,
  meo: null,
  geo: null,
  seo: null,
  listings: null,
  reviews: null,
  monitor: null,
  activity: { posts: 0, scheduled: 0, alerts: 0, rediagnosis: 0, autoRankRuns: 0 },
};

describe("月次レポートの組み立て", () => {
  it("材料が無ければ各節は null、要点は今月の動きだけ", () => {
    const r = buildMonthlyReport(base, "2026-09", now);
    expect(r.rank).toBeNull();
    expect(r.meo).toBeNull();
    expect(r.summary).toEqual(["今月の動き: 投稿 0 件、変化の知らせ 0 件、自動の順位計測 0 回"]);
    expect(r.actions).toContain("順位計測にキーワードを登録する（毎週火曜に自動で測って、この表に載る）");
    expect(r.actions).toContain("来月の投稿を予約する（週 1 回。投稿の画面で AI の下書き → 承認して予約）");
  });

  it("順位: 当月の最後と前月の最後を比べ、上がった語・下がった語を出す", () => {
    const r = buildMonthlyReport(
      {
        ...base,
        rank: {
          keywords: [
            { id: "k1", keyword: "a" },
            { id: "k2", keyword: "b" },
            { id: "k3", keyword: "c" },
          ],
          snapshots: [
            { keywordId: "k1", takenOn: "2026-08-25", rank: 12 },
            { keywordId: "k1", takenOn: "2026-09-08", rank: 8 },
            { keywordId: "k1", takenOn: "2026-09-29", rank: 5 },
            { keywordId: "k2", takenOn: "2026-08-25", rank: 3 },
            { keywordId: "k2", takenOn: "2026-09-29", rank: null },
            { keywordId: "k3", takenOn: "2026-09-29", rank: 20 },
          ],
        },
      },
      "2026-09",
      now,
    );
    expect(r.rank).toMatchObject({ measured: 3, top10: { current: 1, previous: 1 }, avgRank: { current: 12.5, previous: 7.5 } });
    expect(r.rank?.up).toEqual([{ keyword: "a", from: 12, to: 5 }]);
    expect(r.rank?.down).toEqual([{ keyword: "b", from: 3, to: null }]);
    expect(r.actions[0]).toContain("順位が下がった語（b）");
  });

  it("MEO・AI・精密診断・掲載・口コミの前月比", () => {
    const r = buildMonthlyReport(
      {
        ...base,
        meo: [
          {
            name: "店",
            reports: [
              { generatedAt: "2026-08-31T00:00:00Z", score: 70, rating: 4.2, reviews: 30, photos: 10, rank: [{ keyword: "美容院", rank: 5 }] },
              { generatedAt: "2026-09-28T00:00:00Z", score: 75, rating: 4.3, reviews: 30, photos: 10, rank: [{ keyword: "美容院", rank: null }] },
            ],
          },
        ],
        geo: { observations: [{ executedAt: "2026-09-10T00:00:00Z", mentioned: true, cited: false }, { executedAt: "2026-09-12T00:00:00Z", mentioned: false, cited: false }, { executedAt: "2026-08-12T00:00:00Z", mentioned: false, cited: true }] },
        seo: { runs: [{ createdAt: "2026-09-15T00:00:00Z", source: "auto", quick: 65, errors: 2, warnings: 9, improved: 3, worsened: 1 }, { createdAt: "2026-08-10T00:00:00Z", source: "manual", quick: 60, errors: 4, warnings: 8, improved: null, worsened: null }] },
        listings: { stores: [{ name: "店", states: { A: { status: "live", url: "", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: null, check: { result: "missing", detail: "", found: { name: false, phone: false, address: false } } }, B: { status: "todo", url: "", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: null, check: null }, C: { status: "skip", url: "", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: null, check: null } } }] },
        reviews: { responses: [{ createdAt: "2026-09-02T00:00:00Z", rating: 5, isLow: false, clicked: true }, { createdAt: "2026-09-03T00:00:00Z", rating: 2, isLow: true, clicked: false }, { createdAt: "2026-08-20T00:00:00Z", rating: 4, isLow: false, clicked: false }] },
        monitor: { checkedAt: "2026-09-23T20:00:00Z", incidents: 2, critical: 1 },
        activity: { posts: 3, scheduled: 2, alerts: 4, rediagnosis: 1, autoRankRuns: 4 },
      },
      "2026-09",
      now,
    );
    expect(r.meo?.[0]).toMatchObject({ score: { current: 75, previous: 70 }, reviews: { current: 30, previous: 30 }, rank: [{ keyword: "美容院", from: 5, to: null }] });
    expect(r.ai).toEqual({ observations: 2, mentionRate: { current: 50, previous: 0 }, citeRate: { current: 0, previous: 100 } });
    expect(r.seo).toMatchObject({ source: "auto", quick: { current: 65, previous: 60 }, errors: { current: 2, previous: 4 }, improved: 3, worsened: 1 });
    expect(r.listings).toEqual([{ name: "店", live: 1, submitted: 0, todo: 1, total: 2, missing: 1, mismatch: 0 }]);
    expect(r.reviews).toEqual({ responses: { current: 2, previous: 1 }, averageRating: { current: 3.5, previous: 4 }, low: 1, clicks: 1 });
    expect(r.monitor).toEqual({ checkedAt: "2026-09-23T20:00:00Z", incidents: 2, critical: 1 });
    expect(r.actions[0]).toContain("重大な事故 1 件");
    expect(r.actions).toContain("掲載が消えた媒体 1 件を登録し直す（掲載の確認で「見つからない」になったもの）");
    expect(r.actions.some((a) => a.includes("口コミが増えていない"))).toBe(true);
    expect(r.actions.some((a) => a.includes("圏外の語（美容院）"))).toBe(true);
    expect(r.summary[0]).toBe("店: マップ診断 75 点（前月 70 点、+5 改善）、口コミ 30 件（前月 30 件、±0）、評価 4.3（前月 4.2、+0.1 改善）");
    const mail = reportMailText(r, "2026 年 9 月");
    expect(mail).toContain("■ 要点");
    expect(mail).toContain("1. サイトの重大な事故 1 件を直す");
  });

  it("来月やることは 8 件まで", () => {
    const r = buildMonthlyReport(base, "2026-09", now);
    expect(suggestActions(r).length).toBeLessThanOrEqual(8);
  });
});
