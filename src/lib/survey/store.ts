/**
 * ツールについてのアンケートの保存（Supabase の `survey_answers` テーブル）。サーバー専用。
 *
 * 1 回答 = 1 行（「あとで」も 1 行として残す。いつ断られたかも情報なので消さない）。
 * 会社名・業種は保存時の写し（運営者の集計が Clerk を人数分引かずに済むように。`feedback` と同じ）。
 *
 * **答えは運営者しか読まない。**AI のプロンプトには一切渡さない（カルテとの一番の違い）。
 *
 * SQL（Supabase SQL Editor で 1 回。docs/dev/OPERATIONS.md にも同じもの）:
 *   create table if not exists survey_answers (
 *     id bigint generated always as identity primary key,
 *     user_id text not null,
 *     survey_id text not null,
 *     status text not null default 'answered',
 *     company text not null default '',
 *     store_type text not null default '',
 *     answers jsonb not null default '{}'::jsonb,
 *     created_at timestamptz not null default now()
 *   );
 *   create index if not exists survey_answers_user_idx on survey_answers (user_id, created_at desc);
 *   create index if not exists survey_answers_survey_idx on survey_answers (survey_id, created_at desc);
 *   alter table survey_answers enable row level security;
 */
import { z } from "zod";
import { eq } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import type { SurveyEvent, SurveyStatus } from "./due";

const TABLE = "survey_answers";
const COLUMNS = "user_id,survey_id,status,company,store_type,answers,created_at";
/** 運営者の集計で読む上限 */
export const ADMIN_SURVEY_LIMIT = 1000;

const RowSchema = z.object({
  user_id: z.string(),
  survey_id: z.string(),
  status: z.string(),
  company: z.string().nullable().optional(),
  store_type: z.string().nullable().optional(),
  answers: z.unknown(),
  created_at: z.string(),
});

const AnswersSchema = z.record(z.string().max(80), z.string().max(1_000));

function toAnswers(raw: unknown): Record<string, string> {
  const parsed = AnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** その人のこれまでの回答・「あとで」（出すかどうかの判定に使う） */
export async function listUserEvents(userId: string): Promise<SurveyEvent[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=survey_id,status,created_at&user_id=${eq(userId)}&order=created_at.desc&limit=100`);
  const parsed = z.array(RowSchema.pick({ survey_id: true, status: true, created_at: true })).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data
    .filter((r) => r.status === "answered" || r.status === "snoozed")
    .map((r) => ({ surveyId: r.survey_id, status: r.status as SurveyStatus, createdAt: r.created_at }));
}

export interface SaveSurveyInput {
  userId: string;
  surveyId: string;
  status: SurveyStatus;
  answers: Record<string, string>;
  company: string;
  storeType: string;
}

export async function saveSurvey(input: SaveSurveyInput): Promise<void> {
  await supabaseRest<unknown>(TABLE, {
    method: "POST",
    body: {
      user_id: input.userId,
      survey_id: input.surveyId,
      status: input.status,
      company: input.company.slice(0, 100),
      store_type: input.storeType.slice(0, 60),
      answers: input.answers,
    },
    prefer: "return=minimal",
  });
}

export interface SurveyRow {
  userId: string;
  surveyId: string;
  status: SurveyStatus;
  company: string;
  storeType: string;
  answers: Record<string, string>;
  createdAt: string;
}

/** 運営者の集計用（新しい順） */
export async function listSurveyRows(limit = ADMIN_SURVEY_LIMIT): Promise<SurveyRow[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&order=created_at.desc&limit=${limit}`);
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data
    .filter((r) => r.status === "answered" || r.status === "snoozed")
    .map((r) => ({
      userId: r.user_id,
      surveyId: r.survey_id,
      status: r.status as SurveyStatus,
      company: r.company ?? "",
      storeType: r.store_type ?? "",
      answers: toAnswers(r.answers),
      createdAt: r.created_at,
    }));
}
