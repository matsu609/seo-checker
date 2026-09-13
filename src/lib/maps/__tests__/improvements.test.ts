import { describe, expect, it } from "vitest";
import fixture from "./fixtures/place.json";
import { parseDetailResponse } from "../parse";
import { scoreProfile } from "../score";
import { buildImprovementPlan } from "../improvements";
import type { PlaceDetail } from "../types";

const NOW = new Date("2026-09-10T00:00:00Z");
const ideal = parseDetailResponse(fixture)!;

/** 手を入れていない店舗（ほぼ未設定） */
function poor(patch: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    ...ideal,
    website: null,
    phone: null,
    photoCount: 0,
    photos: [],
    rating: 3.8,
    ratingCount: 12,
    reviews: [],
    hours: [],
    ...patch,
  };
}

describe("優先改善リスト", () => {
  it("効果（戻ってくる点数）の大きい順に並ぶ", () => {
    const plan = buildImprovementPlan(scoreProfile(poor(), NOW, null, { extended: false }));
    expect(plan.items.length).toBeGreaterThan(3);
    const gains = plan.items.map((i) => i.gain);
    expect([...gains].sort((a, b) => b - a)).toEqual(gains);
    // 一番効くのは配点 10 の口コミ件数か平均評価
    expect(["reviewCount", "rating"]).toContain(plan.items[0].id);
    expect(plan.items[0].gainLabel).toMatch(/^\+\d+ 点$/);
    expect(plan.items[0].advice.length).toBeGreaterThan(0);
  });

  it("上位 3 件を直すと、いまより点数が上がる", () => {
    const plan = buildImprovementPlan(scoreProfile(poor(), NOW, null, { extended: false }));
    expect(plan.currentScore).not.toBeNull();
    expect(plan.scoreAfterTop3!).toBeGreaterThan(plan.currentScore!);
    expect(plan.scoreAfterTop3!).toBeLessThanOrEqual(100);
  });

  it("満点の店舗では改善項目が出ない", () => {
    const plan = buildImprovementPlan(scoreProfile(ideal, NOW, null, { extended: false }));
    expect(plan.items).toHaveLength(0);
    expect(plan.scoreAfterTop3).toBe(plan.currentScore);
  });

  it("未取得の項目は改善リストに出さず、オーナーにしか分からない項目としてまとめる", () => {
    const plan = buildImprovementPlan(scoreProfile(ideal, NOW, null, { extended: false }));
    expect(plan.items.map((i) => i.id)).not.toContain("description");
    expect(plan.ownerOnly.map((c) => c.id)).toContain("description");
    // クイック診断（21 項目）では 9 項目・38 点分がオーナーにしか分からない
    expect(plan.ownerOnly).toHaveLength(9);
    expect(plan.ownerOnlyWeight).toBe(38);
  });

  it("オーナー入力があれば、その項目も改善リストに載る", () => {
    const owner = {
      updatedAt: "2026-09-01T00:00:00Z",
      input: { description: "", openingDate: false, menu: false, postsLast4Weeks: 0, latestPostText: null, ownerPhotoLastAt: null, logo: false, cover: false, repliedReviews: 0, replyText: null, keywords: [] },
    };
    const plan = buildImprovementPlan(scoreProfile(poor(), NOW, owner, { extended: false }));
    expect(plan.items.map((i) => i.id)).toContain("description");
    // 写真の投稿頻度だけは「最後に投稿した日」が未回答（null）なので測れないまま
    expect(plan.ownerOnly.map((c) => c.id)).toEqual(["photoFreshness"]);
  });
});
