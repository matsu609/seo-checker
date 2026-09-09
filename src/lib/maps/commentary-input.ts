/**
 * MEO レポートの総評。純粋関数だけ（クライアントからも読める）。
 *
 * - buildRuleCommentary: ANTHROPIC_API_KEY が無くても空欄を出さないための、ルール生成の総評
 * - MeoCommentaryInputSchema / toCommentaryInput: AI 総評の入口で受け取る形。
 *   店名・口コミ本文は第三者由来の文字列なので、長さを縛ってからプロンプトに載せる
 */
import { z } from "zod";
import type { PlaceDetail } from "./types";
import type { ProfileCheck, ProfileScore } from "./score";

const STATUS_LABEL: Record<ProfileCheck["status"], string> = {
  pass: "合格",
  warn: "改善余地",
  fail: "未対応",
  unavailable: "未取得",
};

/** 深刻な順に改善点を並べる（fail → warn）。unavailable と pass は除く */
export function improvementCandidates(score: ProfileScore): ProfileCheck[] {
  const rank: Record<ProfileCheck["status"], number> = { fail: 0, warn: 1, pass: 2, unavailable: 3 };
  return [...score.checks]
    .filter((c) => c.status === "fail" || c.status === "warn")
    .sort((a, b) => rank[a.status] - rank[b.status] || b.weight - a.weight);
}

/** ルールだけで日本語の総評を組み立てる（AI 不使用）。段落の配列 */
export function buildRuleCommentary(detail: PlaceDetail, score: ProfileScore): string[] {
  const paragraphs: string[] = [];
  const measured = score.checks.filter((c) => c.status !== "unavailable");
  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const c of measured) if (c.status !== "unavailable") counts[c.status] += 1;

  if (score.score === null || score.grade === null) {
    paragraphs.push(`${detail.name} は、Google マップから評価に使える情報を取得できませんでした。`);
    return paragraphs;
  }

  paragraphs.push(
    `${detail.name} の診断結果は、総合評価 ${score.grade.grade}（${score.grade.label}）、スコア ${score.score} 点です。` +
      `測定できた ${measured.length} 項目のうち、合格 ${counts.pass} 件・改善余地 ${counts.warn} 件・未対応 ${counts.fail} 件でした。`,
  );

  const parts = score.categories.map((c) =>
    c.score === null || c.grade === null
      ? `${c.label}は未測定（${c.total} 項目とも Business Profile 連携が必要）`
      : `${c.label}は ${c.grade.grade}（${c.measured} / ${c.total} 項目を測定）`,
  );
  paragraphs.push(`カテゴリ別では、${parts.join("、")}です。`);

  const top = improvementCandidates(score).slice(0, 3);
  if (top.length > 0) {
    const lines = top.map((c) => `「${c.label}」（${STATUS_LABEL[c.status]}: ${c.detail}）${c.advice ? `— ${c.advice}` : ""}`);
    paragraphs.push(`優先して取り組みたいのは次の点です。${lines.join(" ")}`);
  } else {
    paragraphs.push("測定できた項目はすべて基準を満たしています。現状を維持しつつ、口コミの獲得を継続してください。");
  }

  const unavailable = score.checks.filter((c) => c.status === "unavailable").length;
  if (unavailable > 0) {
    paragraphs.push(
      `投稿・返信・説明文などの ${unavailable} 項目は、Google マップの公開情報からは取得できないため今回は採点対象外です。` +
        "Business Profile 連携を有効にすると、これらも含めた評価になります。",
    );
  }
  return paragraphs;
}

/* ───────────── AI 総評の入力（サーバーの入口で検証する） ───────────── */

const MAX_TEXT = 300;
const MAX_REVIEW_TEXT = 500;
const MAX_CHECKS = 30;
const MAX_REVIEWS = 5;

export const MeoCommentaryInputSchema = z.object({
  placeId: z.string().max(300),
  name: z.string().max(200),
  category: z.string().max(100).nullable(),
  rating: z.number().nullable(),
  ratingCount: z.number().nullable(),
  photoCount: z.number(),
  score: z.number().nullable(),
  grade: z.string().max(2).nullable(),
  categories: z
    .array(z.object({ label: z.string().max(20), score: z.number().nullable(), measured: z.number(), total: z.number() }))
    .max(4),
  checks: z
    .array(
      z.object({
        label: z.string().max(100),
        status: z.enum(["pass", "warn", "fail", "unavailable"]),
        detail: z.string().max(MAX_TEXT),
        advice: z.string().max(MAX_TEXT).optional(),
      }),
    )
    .max(MAX_CHECKS),
  reviews: z
    .array(z.object({ rating: z.number().nullable(), text: z.string().max(MAX_REVIEW_TEXT), relative: z.string().max(50).nullable() }))
    .max(MAX_REVIEWS),
});

export type MeoCommentaryInput = z.infer<typeof MeoCommentaryInputSchema>;

/** レポートから AI 総評の入力を作る（長い文字列はここで切る） */
export function toCommentaryInput(detail: PlaceDetail, score: ProfileScore): MeoCommentaryInput {
  return {
    placeId: detail.id.slice(0, 300),
    name: detail.name.slice(0, 200),
    category: detail.category ? detail.category.slice(0, 100) : null,
    rating: detail.rating,
    ratingCount: detail.ratingCount,
    photoCount: detail.photoCount,
    score: score.score,
    grade: score.grade?.grade ?? null,
    categories: score.categories.map((c) => ({ label: c.label, score: c.score, measured: c.measured, total: c.total })),
    checks: score.checks.slice(0, MAX_CHECKS).map((c) => ({
      label: c.label.slice(0, 100),
      status: c.status,
      detail: c.detail.slice(0, MAX_TEXT),
      ...(c.advice ? { advice: c.advice.slice(0, MAX_TEXT) } : {}),
    })),
    reviews: detail.reviews.slice(0, MAX_REVIEWS).map((r) => ({
      rating: r.rating,
      text: r.text.slice(0, MAX_REVIEW_TEXT),
      relative: r.relative ? r.relative.slice(0, 50) : null,
    })),
  };
}
