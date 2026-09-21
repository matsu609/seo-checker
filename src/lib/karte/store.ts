/**
 * お客様カルテの保存（Supabase の `karte_answers` テーブル）。サーバー専用。
 *
 * 1 利用者 = 1 行（上書き）。会社名・業種は保存時の写しを持つので、運営者の集計画面は
 * この表だけを読めばよい（Clerk を人数分引かない。`feedback` と同じ考え方）。
 *
 * SQL（Supabase SQL Editor で 1 回。docs/dev/OPERATIONS.md にも同じもの）:
 *   create table if not exists karte_answers (
 *     user_id text primary key,
 *     company text not null default '',
 *     store_type text not null default '',
 *     answers jsonb not null default '{}'::jsonb,
 *     updated_at timestamptz not null default now()
 *   );
 *   create index if not exists karte_answers_updated_idx on karte_answers (updated_at desc);
 *   alter table karte_answers enable row level security;
 */
import { z } from "zod";
import { eq } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import { EMPTY_KARTE, KarteAnswersSchema, sanitizeAnswers, type KarteAnswers, type KarteRecord } from "./types";

const TABLE = "karte_answers";
const COLUMNS = "user_id,company,store_type,answers,updated_at";
/** 運営者の集計で読む上限 */
export const ADMIN_KARTE_LIMIT = 500;

const RowSchema = z.object({
  user_id: z.string(),
  company: z.string().nullable().optional(),
  store_type: z.string().nullable().optional(),
  answers: z.unknown(),
  updated_at: z.string().nullable().optional(),
});

function toRecord(row: z.infer<typeof RowSchema>): KarteRecord {
  const parsed = KarteAnswersSchema.safeParse(row.answers);
  return {
    answers: parsed.success ? parsed.data : {},
    company: row.company ?? "",
    storeType: row.store_type ?? "",
    updatedAt: row.updated_at ?? null,
  };
}

/** 本人のカルテ。まだ無ければ空 */
export async function getKarte(userId: string): Promise<KarteRecord> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&limit=1`);
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success || parsed.data.length === 0) return EMPTY_KARTE;
  return toRecord(parsed.data[0]!);
}

export interface SaveKarteInput {
  userId: string;
  answers: KarteAnswers;
  company: string;
  storeType: string;
}

/** 丸ごと上書きで保存する（画面は区切りごとに、いまの全答えを送る） */
export async function saveKarte(input: SaveKarteInput): Promise<KarteRecord> {
  const answers = sanitizeAnswers(input.answers);
  const body = {
    user_id: input.userId,
    company: input.company.slice(0, 100),
    store_type: input.storeType.slice(0, 60),
    answers,
    updated_at: new Date().toISOString(),
  };
  const rows = await supabaseRest<unknown>(`${TABLE}?on_conflict=user_id&select=${COLUMNS}`, {
    method: "POST",
    body,
    prefer: "return=representation,resolution=merge-duplicates",
  });
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success || parsed.data.length === 0) {
    return { answers, company: input.company, storeType: input.storeType, updatedAt: body.updated_at };
  }
  return toRecord(parsed.data[0]!);
}

export interface KarteRow extends KarteRecord {
  userId: string;
}

/** 運営者の集計用。全員ぶん（新しい順） */
export async function listKarte(limit = ADMIN_KARTE_LIMIT): Promise<KarteRow[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&order=updated_at.desc&limit=${limit}`);
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.map((r) => ({ userId: r.user_id, ...toRecord(r) }));
}
