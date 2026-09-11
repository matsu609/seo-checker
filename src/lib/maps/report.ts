/**
 * MEO 診断レポートの形（画面がそのまま描けるもの）。純粋関数。
 */
import type { AreaResult } from "./area";
import { buildRuleCommentary } from "./commentary-input";
import type { MeoRankResult } from "./rank";
import type { MeoOwnerData } from "./owner-input";
import { scoreProfile, type ProfileScore, type ScoreOptions } from "./score";
import type { PlaceDetail } from "./types";

export interface MeoReport {
  /** 診断日時（ISO 8601） */
  generatedAt: string;
  detail: PlaceDetail;
  score: ProfileScore;
  /** ルール生成の総評（AI 不使用）。AI 総評は別 API で取り、画面側で差し替える */
  commentary: string[];
  /** 採点に使ったオーナー申告の日時（ISO 8601）。無ければ null。r27 より前の保存分には無い（undefined） */
  ownerInputAt?: string | null;
  /** 検索順位（r29、有料の自社店舗のみ）。無料診断・競合・r29 より前の保存分には無い */
  rank?: MeoRankResult | null;
  /** 周辺の同業との比較（r29、有料の自社店舗のみ） */
  area?: AreaResult | null;
}

/** owner を渡すと、公開情報では取れない 9 項目も申告で採点する。無料診断は options.extended = false */
export function buildMeoReport(detail: PlaceDetail, now = new Date(), owner: MeoOwnerData | null = null, options: ScoreOptions = {}): MeoReport {
  const score = scoreProfile(detail, now, owner, options);
  return {
    generatedAt: now.toISOString(),
    detail,
    score,
    commentary: buildRuleCommentary(detail, score),
    ownerInputAt: owner?.updatedAt ?? null,
  };
}

/** PDF のファイル名（拡張子なし）。店名の記号を落とし、日付を付ける */
export function meoReportFileName(report: MeoReport): string {
  const name = report.detail.name.replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40);
  const day = report.generatedAt.slice(0, 10).replace(/-/g, "");
  return `MEO診断_${name}_${day}`;
}
