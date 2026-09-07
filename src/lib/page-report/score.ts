/**
 * 4 列表 → セクション得点 → 総合スコア（純関数）。
 *
 * 各行のステータス（適切 / 良好 / 要改善）を 1 / 0.6 / 0 に換算して平均し、
 * セクションの配点を掛ける。配点は config.ts の SECTION_WEIGHTS が唯一の定義。
 */
import { SECTION_DESCRIPTIONS, SECTION_LABELS, SECTION_WEIGHTS, STATUS_RATIO, scoreBandLabel, type SectionId } from "./config";
import type { ReportRow, ReportSection, RowStatus } from "./types";

/** 行 → セクション。行が 0 本のときは満点扱いにしない（配点から外れる） */
export function buildSection(id: SectionId, rows: ReportRow[]): ReportSection {
  const weight = SECTION_WEIGHTS[id];
  const ratio =
    rows.length === 0 ? 0 : rows.reduce((sum, row) => sum + STATUS_RATIO[row.status], 0) / rows.length;
  return {
    id,
    label: SECTION_LABELS[id],
    description: SECTION_DESCRIPTIONS[id],
    weight,
    ratio,
    points: Math.round(weight * ratio * 10) / 10,
    rows,
  };
}

/** セクションの得点を合計して 0〜100 に丸める */
export function totalScore(sections: readonly ReportSection[]): number {
  const total = sections.reduce((sum, section) => sum + section.weight * section.ratio, 0);
  return Math.round(Math.min(100, Math.max(0, total)));
}

export function scoreLabelOf(score: number): string {
  return scoreBandLabel(score);
}

/** 3 段階の判定を数値から決める小さな道具（行を書くときに使う） */
export function statusFrom(value: number, good: number, fair: number, higherIsBetter = true): RowStatus {
  if (higherIsBetter) {
    if (value >= good) return "適切";
    if (value >= fair) return "良好";
    return "要改善";
  }
  if (value <= good) return "適切";
  if (value <= fair) return "良好";
  return "要改善";
}

/** 真偽値から 2 段階の判定 */
export function statusOf(ok: boolean, fallback: RowStatus = "要改善"): RowStatus {
  return ok ? "適切" : fallback;
}
