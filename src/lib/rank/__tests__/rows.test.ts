import { describe, expect, it } from "vitest";
import { buildRankRows, rankText, shortPath } from "../rows";
import type { RankGroup, RankKeyword, RankSnapshot } from "../store";

const groups: RankGroup[] = [{ id: "g1", name: "注力 KW" }];

const keywords: RankKeyword[] = [
  { id: "k1", projectId: "p1", keyword: "AIO 対策", device: "desktop", groupId: "g1", createdAt: "2026-09-01T00:00:00.000Z" },
  { id: "k2", projectId: "p1", keyword: "LLMO とは", device: "mobile", createdAt: "2026-09-01T00:00:00.000Z" },
];

function snap(keywordId: string, takenOn: string, rank: number | null, aio: Partial<RankSnapshot["aiOverview"]> = {}): RankSnapshot {
  return {
    keywordId,
    takenOn,
    measuredAt: `${takenOn}T02:00:00.000Z`,
    rank,
    url: rank === null ? null : "https://example.com/aio",
    title: rank === null ? null : "自社ページ",
    competitors: [],
    aiOverview: { present: false, selfCited: false, competitorCited: false, references: [], ...aio },
    features: [],
  };
}

const snapshots: RankSnapshot[] = [
  snap("k1", "2026-09-01", 12),
  snap("k1", "2026-09-03", 8, { present: true, selfCited: true }),
  snap("k1", "2026-09-05", 4, { present: true, selfCited: false, competitorCited: true }),
  snap("k2", "2026-09-05", null),
];

describe("buildRankRows", () => {
  it("既定は最新と 1 つ前を比較する", () => {
    const rows = buildRankRows(keywords, snapshots, groups);
    expect(rows).toHaveLength(2);
    const [k1, k2] = rows;
    expect(k1.groupName).toBe("注力 KW");
    expect(k1.currentRank).toBe(4);
    expect(k1.previousRank).toBe(8);
    expect(k1.delta).toEqual({ diff: 4, direction: "up" });
    expect(k1.band).toBe("top5");
    expect(k1.aioClass).toBe("competitor");
    expect(k1.spark).toEqual([89, 93, 97]);

    // 履歴が 1 件だけなら前回は未取得
    expect(k2.groupName).toBeNull();
    expect(k2.currentRank).toBeNull();
    expect(k2.previousRank).toBeUndefined();
    expect(k2.delta.direction).toBe("unknown");
    expect(k2.band).toBe("out");
  });

  it("日付を指定でき、欠測日は未取得のまま扱う", () => {
    const rows = buildRankRows(keywords, snapshots, groups, {
      currentDate: "2026-09-04",
      previousDate: "2026-09-01",
    });
    const k1 = rows[0];
    expect(k1.current).toBeUndefined();
    expect(k1.currentRank).toBeUndefined();
    expect(k1.previousRank).toBe(12);
    expect(k1.delta.direction).toBe("unknown");
    expect(k1.aioClass).toBeNull();
  });

  it("履歴がまったく無くても行は作る（登録だけ済んだ状態）", () => {
    const rows = buildRankRows(keywords, [], groups);
    expect(rows.map((r) => r.history)).toEqual([[], []]);
    expect(rows[0].spark).toEqual([]);
    expect(rows[0].aioClass).toBeNull();
  });
});

describe("表示用ヘルパー", () => {
  it("未取得と圏外を書き分ける", () => {
    expect(rankText(undefined)).toBe("未取得");
    expect(rankText(null)).toBe("圏外");
    expect(rankText(3)).toBe("3");
  });

  it("URL はパスだけ見せる", () => {
    expect(shortPath("https://example.com/blog/aio")).toBe("/blog/aio");
    expect(shortPath("https://example.com/")).toBe("/（トップ）");
    expect(shortPath(null)).toBe("");
    expect(shortPath("not a url")).toBe("not a url");
  });
});
