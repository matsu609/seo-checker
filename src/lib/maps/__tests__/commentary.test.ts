/**
 * ルール生成の総評と、AI 総評に渡す入力の絞り込みのテスト。
 */
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/place.json";
import {
  buildRuleCommentary,
  improvementCandidates,
  MeoCommentaryInputSchema,
  toCommentaryInput,
} from "../commentary-input";
import { parseDetailResponse } from "../parse";
import { buildMeoReport, meoReportFileName } from "../report";
import { scoreProfile } from "../score";
import type { PlaceDetail } from "../types";

const NOW = new Date("2026-09-10T00:00:00Z");

function empty(patch: Partial<PlaceDetail> = {}): PlaceDetail {
  return {
    id: "x",
    name: "店",
    address: null,
    rating: null,
    ratingCount: null,
    category: null,
    status: "UNKNOWN",
    phone: null,
    website: null,
    hours: [],
    photoCount: 0,
    reviews: [],
    description: null,
    mapsUrl: null,
    types: [],
    ...patch,
  };
}

describe("ルール生成の総評", () => {
  it("総合評価・カテゴリ別・改善点・未取得の注記の順で段落を作る", () => {
    const d = parseDetailResponse(fixture)!;
    const s = scoreProfile(d, NOW);
    const p = buildRuleCommentary(d, s);
    expect(p.length).toBeGreaterThanOrEqual(3);
    expect(p[0]).toContain("総合評価 A");
    expect(p[0]).toContain("100 点");
    expect(p[1]).toContain("基本情報は A");
    expect(p[1]).toContain("投稿は未測定");
    // 全項目合格なので改善点は「維持」の文になる
    expect(p[2]).toContain("基準を満たしています");
    expect(p[p.length - 1]).toContain("Business Profile 連携");
  });

  it("改善点は fail → warn の順で、重い項目から並ぶ", () => {
    const d = empty({ ratingCount: 5, rating: 4.1, photoCount: 3, status: "OPERATIONAL", hours: ["月曜日: 10時〜19時"] });
    const s = scoreProfile(d, NOW);
    const top = improvementCandidates(s);
    expect(top.length).toBeGreaterThan(0);
    const statuses = top.map((c) => c.status);
    const firstWarn = statuses.indexOf("warn");
    const lastFail = statuses.lastIndexOf("fail");
    if (firstWarn !== -1 && lastFail !== -1) expect(lastFail).toBeLessThan(firstWarn);
    expect(top.every((c) => c.status !== "unavailable" && c.status !== "pass")).toBe(true);
    expect(buildRuleCommentary(d, s)[2]).toContain("優先して取り組みたい");
  });
});

describe("AI 総評の入力", () => {
  it("レポートから作った入力はスキーマを通る", () => {
    const d = parseDetailResponse(fixture)!;
    const input = toCommentaryInput(d, scoreProfile(d, NOW));
    expect(MeoCommentaryInputSchema.safeParse(input).success).toBe(true);
    expect(input.checks.length).toBe(21);
    expect(input.reviews.length).toBe(2);
  });

  it("長い口コミ本文・多すぎる口コミは切り詰める", () => {
    const long = "あ".repeat(2000);
    const reviews = Array.from({ length: 8 }, (_, i) => ({ rating: 5, text: long, author: null, publishedAt: null, relative: `${i} 日前` }));
    const d = empty({ reviews });
    const input = toCommentaryInput(d, scoreProfile(d, NOW));
    expect(input.reviews.length).toBe(5);
    expect(input.reviews[0].text.length).toBe(500);
    expect(MeoCommentaryInputSchema.safeParse(input).success).toBe(true);
  });

  it("スキーマは上限を超える入力を拒む", () => {
    const d = parseDetailResponse(fixture)!;
    const input = toCommentaryInput(d, scoreProfile(d, NOW));
    expect(MeoCommentaryInputSchema.safeParse({ ...input, name: "x".repeat(201) }).success).toBe(false);
    expect(MeoCommentaryInputSchema.safeParse({ ...input, checks: Array(31).fill(input.checks[0]) }).success).toBe(false);
  });
});

describe("レポート", () => {
  it("日時・採点・総評をまとめ、ファイル名に記号を残さない", () => {
    const d = parseDetailResponse(fixture)!;
    const r = buildMeoReport({ ...d, name: "A/B:店 名?" }, NOW);
    expect(r.generatedAt).toBe(NOW.toISOString());
    expect(r.score.score).toBe(100);
    expect(r.commentary.length).toBeGreaterThan(0);
    expect(meoReportFileName(r)).toBe("MEO診断_A_B_店_名__20260910");
  });
});
