import { describe, expect, it } from "vitest";
import { LATER_BELOW_GAIN, SEO_BLOCKING, URGENCY_LABELS, URGENCY_ORDER, urgencyIndex, urgencyOf } from "../urgency";

describe("対応の優先度（urgencyOf）", () => {
  it("載らない・読まれない原因の項目は、点数が小さくても「急ぎで対応」", () => {
    expect(urgencyOf({ id: "noindex", status: "fail", gain: 0.3 }, SEO_BLOCKING)).toBe("now");
    expect(urgencyOf({ id: "robots-txt", status: "fail", gain: 1.6 }, SEO_BLOCKING)).toBe("now");
    expect(urgencyOf({ id: "js-rendering", status: "fail", gain: 7.5 }, SEO_BLOCKING)).toBe("now");
    expect(urgencyOf({ id: "title", status: "fail", gain: 6 }, SEO_BLOCKING)).toBe("now");
    expect(urgencyOf({ id: "ai-crawlers-allowed", status: "fail", gain: 5 }, SEO_BLOCKING)).toBe("now");
  });

  it("Googlebot / Bingbot は片方だけの拒否（warn）でも急ぎ", () => {
    expect(urgencyOf({ id: "search-crawlers-allowed", status: "warn", gain: 2.5 }, SEO_BLOCKING)).toBe("now");
  });

  it("急ぎの項目でも、判定が一覧に無い状態なら点数で決まる（title の長さ warn は要改善）", () => {
    expect(urgencyOf({ id: "title", status: "warn", gain: 3 }, SEO_BLOCKING)).toBe("soon");
    expect(urgencyOf({ id: "robots-txt", status: "warn", gain: 0.8 }, SEO_BLOCKING)).toBe("later");
  });

  it(`それ以外は見込み効果が ${LATER_BELOW_GAIN} 点以上なら要改善、未満なら後回しで OK（境界値は要改善）`, () => {
    expect(urgencyOf({ id: "jsonld-exists", status: "fail", gain: 6.25 }, SEO_BLOCKING)).toBe("soon");
    expect(urgencyOf({ id: "ogp", status: "warn", gain: LATER_BELOW_GAIN }, SEO_BLOCKING)).toBe("soon");
    expect(urgencyOf({ id: "llms-txt", status: "fail", gain: 1.67 }, SEO_BLOCKING)).toBe("later");
    expect(urgencyOf({ id: "image-alt", status: "warn", gain: 1.25 }, SEO_BLOCKING)).toBe("later");
  });

  it("規則の無い項目・壊れた gain でも落ちない", () => {
    expect(urgencyOf({ id: "unknown", status: "fail", gain: Number.NaN }, SEO_BLOCKING)).toBe("later");
    expect(urgencyOf({ id: "unknown", status: "fail", gain: 10 }, {})).toBe("soon");
  });

  it("表示順は 急ぎ → 要改善 → 放置 OK で、全部にラベルがある", () => {
    expect(URGENCY_ORDER).toEqual(["now", "soon", "later"]);
    expect(URGENCY_ORDER.map(urgencyIndex)).toEqual([0, 1, 2]);
    for (const u of URGENCY_ORDER) expect(URGENCY_LABELS[u].length).toBeGreaterThan(0);
  });
});
