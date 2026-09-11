/**
 * 各項目のコンサル文章（guide.ts）が、採点の全項目（無料 21 / 有料 28）に揃っているか。
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/place.json";
import { CHECK_GUIDE, guideFor, IDEAL_STATE, MEO_CONCLUSION } from "../guide";
import { parseDetailResponse } from "../parse";
import { scoreProfile } from "../score";

describe("項目ごとの解説", () => {
  it("有料 28 項目すべてに why / goal / keep がある", () => {
    const d = parseDetailResponse(fixture)!;
    const ids = scoreProfile(d, new Date()).checks.map((c) => c.id);
    expect(ids).toHaveLength(28);
    for (const id of ids) {
      const g = guideFor(id);
      expect(g, id).toBeDefined();
      expect(g!.why.length, id).toBeGreaterThan(30);
      expect(g!.goal.length, id).toBeGreaterThan(10);
      expect(g!.keep.length, id).toBeGreaterThan(30);
    }
    // 解説だけあって項目が無い、という食い違いも無い
    expect(Object.keys(CHECK_GUIDE).sort()).toEqual([...ids].sort());
  });

  it("目指すべき状態の表と結論", () => {
    expect(IDEAL_STATE.map((r) => r.item)).toEqual(["評価", "口コミ数", "口コミの質", "返信率", "写真", "投稿（最新情報）", "基本情報", "Q&A", "星の分布"]);
    expect(MEO_CONCLUSION).toContain("競合上位 3 社");
    expect(guideFor("nope")).toBeUndefined();
  });
});
