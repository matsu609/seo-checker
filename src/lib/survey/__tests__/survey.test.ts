/**
 * ツールについてのアンケート（相手は B = ツールを使っている事業者）を固定するテスト。
 *
 * 守りたいこと:
 *   - 1 回 4 問まで（長いと答えてもらえない）
 *   - 一度に出すのは 1 つ、答えた回は二度と出さない、「あとで」は 14 日効く
 *   - 期間があいたら、いちばん新しい節目を出す（1 年の人に「2 週間の」を出さない）
 */
import { describe, expect, it } from "vitest";
import { responseRate, summarizeSurveys, surveyLabel } from "../aggregate";
import { MAX_QUESTIONS_PER_SURVEY, SURVEYS, findSurvey, findSurveyQuestion } from "../definitions";
import { SNOOZE_DAYS, daysBetween, dueSurvey, type SurveyEvent } from "../due";
import type { SurveyRow } from "../store";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-21T00:00:00Z");
const signedUpDaysAgo = (d: number) => NOW - d * DAY;

describe("設問の定義", () => {
  it("回は節目の順に並び、1 回 4 問まで、自由記述が必ず 1 問以上ある", () => {
    const days = SURVEYS.map((s) => s.afterDays);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
    for (const s of SURVEYS) {
      expect(s.questions.length, s.id).toBeGreaterThan(0);
      expect(s.questions.length, s.id).toBeLessThanOrEqual(MAX_QUESTIONS_PER_SURVEY);
      expect(s.questions.some((q) => q.kind !== "choice"), s.id).toBe(true);
      for (const q of s.questions) {
        expect(q.max, q.id).toBeGreaterThan(0);
        if (q.kind === "choice") expect(q.options?.length ?? 0, q.id).toBeGreaterThan(1);
      }
    }
  });

  it("回の ID と設問の ID は重複しない（保存のキーなので）", () => {
    expect(new Set(SURVEYS.map((s) => s.id)).size).toBe(SURVEYS.length);
    for (const s of SURVEYS) {
      const ids = s.questions.map((q) => q.id);
      expect(new Set(ids).size, s.id).toBe(ids.length);
    }
  });

  it("ID から引ける", () => {
    expect(findSurvey("quarter-90d")?.afterDays).toBe(90);
    expect(findSurvey("無い")).toBeNull();
    expect(findSurveyQuestion("quarter-90d", "churn-thought")?.kind).toBe("long");
    expect(findSurveyQuestion("quarter-90d", "無い")).toBeNull();
    expect(surveyLabel("year-365d")).toContain("1 年");
  });
});

describe("いつ出すか", () => {
  const due = (days: number, events: SurveyEvent[] = []) => dueSurvey({ signedUpAtMs: signedUpDaysAgo(days), events, nowMs: NOW });

  it("節目に達するまでは出さない", () => {
    expect(due(0)).toBeNull();
    expect(due(13)).toBeNull();
    expect(due(14)?.id).toBe("start-14d");
  });

  it("答えた回は二度と出さない", () => {
    const answered: SurveyEvent[] = [{ surveyId: "start-14d", status: "answered", createdAt: "2026-09-10T00:00:00Z" }];
    expect(due(20, answered)).toBeNull();
    // 次の節目が来たら、次の回を出す
    expect(due(95, answered)?.id).toBe("quarter-90d");
  });

  it("「あとで」を押されたら 14 日は何も出さない", () => {
    const snoozed = (daysAgo: number): SurveyEvent[] => [{ surveyId: "start-14d", status: "snoozed", createdAt: new Date(NOW - daysAgo * DAY).toISOString() }];
    expect(due(20, snoozed(1))).toBeNull();
    expect(due(20, snoozed(SNOOZE_DAYS - 1))).toBeNull();
    expect(due(20, snoozed(SNOOZE_DAYS))?.id).toBe("start-14d");
  });

  it("期間があいたら、いちばん新しい節目を出す（1 年の人に「2 週間の」を出さない）", () => {
    expect(due(400)?.id).toBe("year-365d");
    expect(due(100)?.id).toBe("quarter-90d");
  });

  it("答え終わっていれば何も出さない。登録日が未来なら出さない", () => {
    const all: SurveyEvent[] = SURVEYS.map((s) => ({ surveyId: s.id, status: "answered", createdAt: "2026-01-01T00:00:00Z" }));
    expect(due(400, all)).toBeNull();
    expect(dueSurvey({ signedUpAtMs: NOW + 5 * DAY, events: [], nowMs: NOW })).toBeNull();
  });

  it("日数の計算は切り捨て", () => {
    expect(daysBetween(NOW - DAY - 1000, NOW)).toBe(1);
    expect(daysBetween(NOW - DAY + 1000, NOW)).toBe(0);
  });
});

describe("運営者の集計", () => {
  const row = (over: Partial<SurveyRow>): SurveyRow => ({
    userId: "u1",
    surveyId: "quarter-90d",
    status: "answered",
    company: "A 食堂",
    storeType: "飲食店",
    answers: {},
    createdAt: "2026-09-20T00:00:00Z",
    ...over,
  });

  it("選択肢は人数、自由記述は答えをそのまま出す", () => {
    const rows = [
      row({ userId: "u1", answers: { satisfaction: "満足", "churn-thought": "何が良くなったか分からなかった" } }),
      row({ userId: "u2", company: "B 歯科", answers: { satisfaction: "満足" } }),
      row({ userId: "u3", company: "C 整体", answers: { satisfaction: "やや不満" } }),
    ];
    const quarter = summarizeSurveys(rows).find((s) => s.surveyId === "quarter-90d")!;
    expect(quarter.answered).toBe(3);
    const satisfaction = quarter.questions.find((q) => q.id === "satisfaction")!;
    expect(satisfaction.choices[0]).toEqual({ option: "満足", count: 2 });
    expect(satisfaction.answers).toEqual([]);
    const churn = quarter.questions.find((q) => q.id === "churn-thought")!;
    expect(churn.answers).toHaveLength(1);
    expect(churn.answers[0]?.value).toContain("良くなったか分からなかった");
  });

  it("回答が無い回も 0 件として返す（作ったのに誰も答えていないことが分かる）", () => {
    const summaries = summarizeSurveys([]);
    expect(summaries).toHaveLength(SURVEYS.length);
    expect(summaries.every((s) => s.answered === 0)).toBe(true);
  });

  it("「あとで」は回答に数えないが、回答率の分母には入る", () => {
    const rows = [row({ userId: "u1", answers: { satisfaction: "満足" } }), row({ userId: "u2", status: "snoozed" })];
    const quarter = summarizeSurveys(rows).find((s) => s.surveyId === "quarter-90d")!;
    expect(quarter.answered).toBe(1);
    expect(quarter.snoozed).toBe(1);
    expect(responseRate(quarter)).toBe(0.5);
    expect(responseRate(summarizeSurveys([])[0]!)).toBeNull();
  });
});
