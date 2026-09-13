import { describe, expect, it } from "vitest";
import fixture from "./fixtures/place.json";
import { parseDetailResponse } from "../parse";
import { scoreProfile } from "../score";
import { CRITERIA, criteriaFor } from "../criteria";

const NOW = new Date("2026-09-10T00:00:00Z");

describe("採点基準の付録", () => {
  it("採点する全項目（28 項目）に基準が書いてある", () => {
    const checks = scoreProfile(parseDetailResponse(fixture)!, NOW).checks;
    for (const c of checks) expect(criteriaFor(c.id), c.id).not.toBeNull();
    expect(CRITERIA).toHaveLength(checks.length);
  });

  it("使われていない項目の基準が残っていない", () => {
    const ids = new Set(scoreProfile(parseDetailResponse(fixture)!, NOW).checks.map((c) => c.id));
    for (const row of CRITERIA) expect(ids.has(row.id), row.id).toBe(true);
  });

  it("しきい値は定数から作る（数字の書き写しをしない）", () => {
    expect(criteriaFor("rating")!.pass).toContain("4.5");
    expect(criteriaFor("recent")!.pass).toContain("30 日");
    expect(criteriaFor("ownerPhotos")!.pass).toContain("5 枚");
  });
});
