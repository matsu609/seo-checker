/**
 * MEO 診断レポートの形（画面がそのまま描けるもの）。純粋関数。
 */
import { buildRuleCommentary } from "./commentary-input";
import { scoreProfile, type ProfileScore } from "./score";
import type { PlaceDetail } from "./types";

export interface MeoReport {
  /** 診断日時（ISO 8601） */
  generatedAt: string;
  detail: PlaceDetail;
  score: ProfileScore;
  /** ルール生成の総評（AI 不使用）。AI 総評は別 API で取り、画面側で差し替える */
  commentary: string[];
}

export function buildMeoReport(detail: PlaceDetail, now = new Date()): MeoReport {
  const score = scoreProfile(detail, now);
  return {
    generatedAt: now.toISOString(),
    detail,
    score,
    commentary: buildRuleCommentary(detail, score),
  };
}

/** PDF のファイル名（拡張子なし）。店名の記号を落とし、日付を付ける */
export function meoReportFileName(report: MeoReport): string {
  const name = report.detail.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
  const day = report.generatedAt.slice(0, 10).replace(/-/g, "");
  return `MEO診断_${name}_${day}`;
}
