/**
 * 定期処理の実行記録（Supabase の cron_runs テーブル）。サーバー専用。
 *
 * 「昨日ちゃんと動いたか」をマスター画面で確かめるためのもの。1 行 = 1 ジョブの 1 回。
 * テーブルが無くてもジョブ自体は止めない（記録だけ諦める）。
 *
 * SQL（Supabase SQL Editor で 1 回）:
 *   create table if not exists cron_runs (
 *     id uuid primary key default gen_random_uuid(),
 *     job text not null,
 *     status text not null,
 *     summary jsonb not null default '{}'::jsonb,
 *     started_at timestamptz not null default now(),
 *     finished_at timestamptz
 *   );
 *   create index if not exists cron_runs_job_idx on cron_runs (job, started_at desc);
 *   alter table cron_runs enable row level security;
 */
import { z } from "zod";
import { supabaseRest } from "@/lib/db/supabase";
import type { JobId, JobRunStatus } from "./types";

const TABLE = "cron_runs";

export interface JobRunRecord {
  id: string;
  job: JobId;
  status: JobRunStatus | "running";
  summary: Record<string, unknown>;
  startedAt: string;
  finishedAt: string | null;
}

const RowSchema = z.object({
  id: z.string(),
  job: z.string(),
  status: z.string(),
  summary: z.unknown(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
});

function fromRow(row: z.infer<typeof RowSchema>): JobRunRecord {
  const summary = row.summary && typeof row.summary === "object" && !Array.isArray(row.summary) ? (row.summary as Record<string, unknown>) : {};
  return { id: row.id, job: row.job as JobId, status: row.status as JobRunRecord["status"], summary, startedAt: row.started_at, finishedAt: row.finished_at };
}

export async function startRun(job: JobId, at = new Date()): Promise<string | null> {
  try {
    const rows = await supabaseRest<unknown>(`${TABLE}?select=id`, {
      method: "POST",
      body: { job, status: "running", summary: {}, started_at: at.toISOString() },
      prefer: "return=representation",
    });
    const parsed = z.array(z.object({ id: z.string() })).min(1).safeParse(rows);
    return parsed.success ? parsed.data[0].id : null;
  } catch {
    return null;
  }
}

export async function finishRun(id: string | null, status: JobRunStatus, summary: Record<string, unknown>, at = new Date()): Promise<void> {
  if (!id) return;
  try {
    await supabaseRest<unknown>(`${TABLE}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { status, summary, finished_at: at.toISOString() },
      prefer: "return=minimal",
    });
  } catch (err) {
    console.error("[jobs] 実行記録を更新できませんでした", err instanceof Error ? err.message : err);
  }
}

export async function listRecentRuns(limit = 60): Promise<JobRunRecord[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=*&order=started_at.desc&limit=${limit}`);
  const parsed = z.array(RowSchema).safeParse(rows);
  return parsed.success ? parsed.data.map(fromRow) : [];
}
