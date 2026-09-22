/**
 * サイト側（サイト監視・サイテーション）の「計測前のイメージ」のデータ（純関数・テスト対象）。
 *
 * 利用者の指示 2026-09-22:「すべての計測データに言えるのですが、グラフにしてください。
 * デモデータを入れて、最初から…ユーザーに直感的にわかるように。サービスの使い始めでも」。
 * MEO 以外の計測画面にも同じ約束（未来の日付・破線・「イメージ」の 4 点セット）で足す。
 */
import { comingWeekdays } from "./dates";

/** サイト監視の自動確認の曜日（毎週水曜 5:00。`src/lib/jobs/schedule.ts` と合わせる） */
export const MONITOR_WEEKDAY = 3;

/** 見本に描く回数 */
export const SAMPLE_CHECKS = 4;

/**
 * 事故の件数の形。「見つかって、直して、ゼロで落ち着く」という、この機能で目指す動き方。
 * 0 件が続くのが正常なので、見本も最後は 0 にする。
 */
const INCIDENT_SHAPE: readonly number[] = [3, 2, 0, 0];

export function sampleIncidentChecks(count = SAMPLE_CHECKS, now = new Date()): { dates: string[]; incidents: number[] } {
  return {
    dates: comingWeekdays(count, MONITOR_WEEKDAY, now),
    incidents: Array.from({ length: count }, (_, i) => INCIDENT_SHAPE[Math.min(i, INCIDENT_SHAPE.length - 1)] ?? 0),
  };
}

/**
 * サイテーション（掲載状況）の見本。
 * 「主要媒体のうち何件に載っているか」が、この機能で見る唯一の数字。
 */
export interface DemoCoverage {
  found: number;
  missing: number;
  /** 見つかった言及サイトの件数 */
  sites: number;
}

export const SAMPLE_COVERAGE: DemoCoverage = { found: 4, missing: 6, sites: 12 };
