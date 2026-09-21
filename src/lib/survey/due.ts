/**
 * 「いま、この人に、どのアンケートを出すか」の判定（純関数）。
 *
 * 考え方:
 *   - 登録から一定の日数がたった時点で 1 回だけ聞く（使い始め 14 日 / 3 か月 / 1 年）
 *   - **一度に出すのは 1 つだけ。**まとめて出すと全部無視される
 *   - すでに答えた回は二度と出さない
 *   - 「あとで」を押されたら 14 日は出さない（断る自由を残す。しつこいと答えなくなる）
 *   - 期間があいて複数の回が対象になったら、**いちばん新しい節目**を出す
 *     （1 年使っている人に「使い始めて 2 週間のアンケート」を出さない）
 */
import { SURVEYS, type SurveyDefinition } from "./definitions";

/** 「あとで」を押されてから、次に出すまでの日数 */
export const SNOOZE_DAYS = 14;

export type SurveyStatus = "answered" | "snoozed";

export interface SurveyEvent {
  surveyId: string;
  status: SurveyStatus;
  /** ISO 文字列 */
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(fromMs: number, toMs: number): number {
  return Math.floor((toMs - fromMs) / DAY_MS);
}

export interface DueInput {
  /** 登録日時（ミリ秒。Clerk の user.createdAt） */
  signedUpAtMs: number;
  events: readonly SurveyEvent[];
  nowMs: number;
}

/**
 * 出すべきアンケート。無ければ null。
 */
export function dueSurvey(input: DueInput): SurveyDefinition | null {
  const elapsed = daysBetween(input.signedUpAtMs, input.nowMs);
  if (elapsed < 0) return null;

  const answered = new Set(input.events.filter((e) => e.status === "answered").map((e) => e.surveyId));
  // 直近の「あとで」（どの回に対してでも、次の 14 日は何も出さない）
  const lastSnooze = input.events
    .filter((e) => e.status === "snoozed")
    .map((e) => Date.parse(e.createdAt))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0];
  if (lastSnooze !== undefined && daysBetween(lastSnooze, input.nowMs) < SNOOZE_DAYS) return null;

  // 節目を過ぎていて、まだ答えていないもののうち、いちばん新しい節目
  const candidates = SURVEYS.filter((s) => elapsed >= s.afterDays && !answered.has(s.id));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, s) => (s.afterDays > best.afterDays ? s : best));
}
