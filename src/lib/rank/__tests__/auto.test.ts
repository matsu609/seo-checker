import { describe, expect, it } from "vitest";
import { buildRankAlert, detectRankDrops, previousByKeyword, RANK_AUTO_LIMITS, rankAutoLimit, selectAutoTargets } from "../auto";
import type { RankKeyword, RankSnapshot } from "../store";

const kw = (id: string, keyword: string, projectId = "p1", createdAt = "2026-09-01T00:00:00Z"): RankKeyword => ({ id, projectId, keyword, device: "desktop", createdAt });
const snap = (keywordId: string, takenOn: string, rank: number | null): RankSnapshot => ({
  keywordId,
  takenOn,
  measuredAt: `${takenOn}T00:00:00Z`,
  rank,
  url: null,
  title: null,
  competitors: [],
  aiOverview: { present: false, selfCited: false, competitorCited: false, references: [] },
  features: [],
});
const projects = [
  { id: "p1", name: "自社", domain: "example.jp", startUrl: "https://example.jp/", brandAliases: [], competitors: [{ id: "c1", name: "競合", domains: ["rival.jp"], brandAliases: [] }], createdAt: "2026-09-01T00:00:00Z" },
];

describe("自動計測の対象", () => {
  it("登録が古い順に上限まで。ホームページが無い語は外す", () => {
    const keywords = [kw("k2", "b", "p1", "2026-09-02T00:00:00Z"), kw("k1", "a"), kw("k3", "c", "p9"), kw("k4", " ")];
    const t = selectAutoTargets({ projects, rankKeywords: keywords }, 5);
    expect(t.map((x) => x.keyword.id)).toEqual(["k1", "k2"]);
    expect(t[0].projectDomain).toBe("example.jp");
    expect(t[0].competitorDomains).toEqual(["rival.jp"]);
    expect(selectAutoTargets({ projects, rankKeywords: keywords }, 1).map((x) => x.keyword.id)).toEqual(["k1"]);
    expect(selectAutoTargets({ projects, rankKeywords: keywords }, 0)).toEqual([]);
    expect(selectAutoTargets({ projects: "x", rankKeywords: keywords }, 5)).toEqual([]);
  });

  it("プランの上限（2026-09-21 利用者の決定: スタンダード 20 語。上下の段は順序が崩れないように）", () => {
    expect(RANK_AUTO_LIMITS).toEqual({ free: 0, light: 10, standard: 20, premium: 50 });
    expect(RANK_AUTO_LIMITS.light).toBeLessThan(RANK_AUTO_LIMITS.standard);
    expect(RANK_AUTO_LIMITS.standard).toBeLessThan(RANK_AUTO_LIMITS.premium);
  });

  // 運用者・管理アカウントは契約が無くてもツールを全部使える立場なので、上限も最上段に合わせる
  it("運用者・管理アカウントは契約が無くても最上段", () => {
    expect(rankAutoLimit("free", false)).toBe(0);
    expect(rankAutoLimit("free", true)).toBe(RANK_AUTO_LIMITS.premium);
    // 契約があるときは、その契約の上限のまま（立場で増やさない）
    expect(rankAutoLimit("light", true)).toBe(RANK_AUTO_LIMITS.light);
  });
});

describe("下落の検出", () => {
  const keywords = [kw("k1", "a"), kw("k2", "b"), kw("k3", "c"), kw("k4", "d"), kw("k5", "e")];
  it("圏外・10 位以内から外れた・5 位以上下がった、だけを知らせる", () => {
    const history = [snap("k1", "2026-09-08", 3), snap("k2", "2026-09-08", 8), snap("k3", "2026-09-08", 20), snap("k4", "2026-09-08", 20), snap("k5", "2026-09-08", null)];
    const prev = previousByKeyword(history, "2026-09-15");
    const current = [snap("k1", "2026-09-15", null), snap("k2", "2026-09-15", 12), snap("k3", "2026-09-15", 25), snap("k4", "2026-09-15", 24), snap("k5", "2026-09-15", 50)];
    const drops = detectRankDrops(current, prev, keywords);
    expect(drops.map((d) => [d.keywordId, d.kind])).toEqual(
      expect.arrayContaining([
        ["k1", "out"],
        ["k2", "lost_top"],
        ["k3", "drop"],
      ]),
    );
    expect(drops.some((d) => d.keywordId === "k4")).toBe(false);
    expect(drops.some((d) => d.keywordId === "k5")).toBe(false);
  });

  it("直前の値は同じ日を除いた最新", () => {
    const prev = previousByKeyword([snap("k1", "2026-09-01", 5), snap("k1", "2026-09-10", 7), snap("k1", "2026-09-15", 9)], "2026-09-15");
    expect(prev.get("k1")?.rank).toBe(7);
  });

  it("知らせの文面", () => {
    const alert = buildRankAlert("example.jp", [
      { keywordId: "k1", keyword: "a", device: "desktop", from: 3, to: null, kind: "out" },
      { keywordId: "k2", keyword: "b", device: "mobile", from: 8, to: 12, kind: "lost_top" },
    ]);
    expect(alert.title).toBe("example.jp の順位が下がった語が 2 件あります");
    expect(alert.body).toContain("・a（PC）: 3 位 → 圏外");
    expect(alert.body).toContain("・b（スマホ）: 8 位 → 12 位（10 位以内から外れました）");
  });
});
