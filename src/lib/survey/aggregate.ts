/**
 * アンケートの集計（純関数）。運営者の画面が使う。
 *
 * カルテの集計と同じ考え方で**設問ごとに並べる**。1 人の答えではなく、
 * 同じ設問への複数の答えを並べたときに見える共通点が、次に作るものを決める。
 *
 * 選択肢の設問は「何人がどれを選んだか」、自由記述は「答えをそのまま全部」出す
 * （数えるだけだと、いちばん大事な言い回しが消える）。
 */
import { SURVEYS, findSurvey, type SurveyQuestion } from "./definitions";
import type { SurveyRow } from "./store";

export interface FreeAnswer {
  userId: string;
  company: string;
  storeType: string;
  createdAt: string;
  value: string;
}

export interface QuestionSummary {
  id: string;
  label: string;
  kind: SurveyQuestion["kind"];
  /** 選択肢の設問だけ（選ばれた数の多い順） */
  choices: { option: string; count: number }[];
  /** 自由記述の答え（新しい順） */
  answers: FreeAnswer[];
}

export interface SurveySummary {
  surveyId: string;
  label: string;
  description: string;
  /** 答えてくれた人数 */
  answered: number;
  /** 「あとで」を押された回数 */
  snoozed: number;
  questions: QuestionSummary[];
}

/** 回ごと・設問ごとにまとめる。回答が 1 件も無い回も（0 件と分かるように）返す */
export function summarizeSurveys(rows: readonly SurveyRow[]): SurveySummary[] {
  return SURVEYS.map((survey) => {
    const mine = rows.filter((r) => r.surveyId === survey.id);
    const answeredRows = mine.filter((r) => r.status === "answered");
    const questions: QuestionSummary[] = survey.questions.map((q) => {
      const values = answeredRows
        .map((r) => ({ userId: r.userId, company: r.company, storeType: r.storeType, createdAt: r.createdAt, value: (r.answers[q.id] ?? "").trim() }))
        .filter((a) => a.value.length > 0);
      const choices: { option: string; count: number }[] = [];
      if (q.kind === "choice") {
        for (const option of q.options ?? []) {
          const count = values.filter((v) => v.value === option).length;
          choices.push({ option, count });
        }
        choices.sort((a, b) => b.count - a.count);
      }
      return { id: q.id, label: q.label, kind: q.kind, choices, answers: q.kind === "choice" ? [] : values };
    });
    return {
      surveyId: survey.id,
      label: survey.label,
      description: survey.description,
      answered: answeredRows.length,
      snoozed: mine.filter((r) => r.status === "snoozed").length,
      questions,
    };
  });
}

/** 回答率（答えた人 ÷ 出した人）。出した回数が 0 なら null */
export function responseRate(summary: SurveySummary): number | null {
  const shown = summary.answered + summary.snoozed;
  return shown === 0 ? null : summary.answered / shown;
}

export function surveyLabel(id: string): string {
  return findSurvey(id)?.label ?? id;
}
