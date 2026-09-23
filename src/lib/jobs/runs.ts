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
import { eq, gte } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import { cursorFromRun } from "./cursor";
import type { JobRunStatus, RecordedJob } from "./types";

const TABLE = "cron_runs";

export interface JobRunRecord {
  id: string;
  job: RecordedJob;
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
  return { id: row.id, job: row.job as RecordedJob, status: row.status as JobRunRecord["status"], summary, startedAt: row.started_at, finishedAt: row.finished_at };
}

export async function startRun(job: RecordedJob, at = new Date(), status: JobRunStatus | "running" = "running"): Promise<string | null> {
  try {
    const rows = await supabaseRest<unknown>(`${TABLE}?select=id`, {
      method: "POST",
      body: { job, status, summary: {}, started_at: at.toISOString() },
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

/**
 * 飛ばしたジョブも記録に残す（2026-09-23）。以前は残り時間が足りずに飛ばした日が
 * 何も残らず、マスター画面では「動いていない」のか「飛ばされた」のか区別できなかった。
 */
export async function recordSkipped(job: RecordedJob, reason: string, at = new Date()): Promise<void> {
  const id = await startRun(job, at, "skipped");
  await finishRun(id, "skipped", { reason }, at);
}

/**
 * `since` 以降に最後まで終わった（ok）実行があるか。月次のジョブの「今月はもう済んだか」に使う。
 * 記録が読めないときは「済んでいない」にする（動かしたほうが安全。各ジョブは同じ月の二重実行を自分で避ける）。
 */
export async function completedSince(job: RecordedJob, since: string): Promise<boolean> {
  try {
    const rows = await supabaseRest<unknown>(`${TABLE}?select=id&job=${eq(job)}&status=eq.ok&started_at=${gte(since)}&limit=1`);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

/**
 * 前回どこまで回れたか（次に始める人の ID）。時間切れで終わった実行の summary に残してある。
 * 飛ばした日・実行中の記録は見ない（最後に実際に回った実行だけを見る）。
 */
export async function lastResumeCursor(job: RecordedJob): Promise<string | null> {
  try {
    const rows = await supabaseRest<unknown>(`${TABLE}?select=*&job=${eq(job)}&status=in.(ok,aborted)&order=started_at.desc&limit=1`);
    const parsed = z.array(RowSchema).safeParse(rows);
    return parsed.success && parsed.data[0] ? cursorFromRun(fromRow(parsed.data[0])) : null;
  } catch {
    return null;
  }
}

export async function listRecentRuns(limit = 60): Promise<JobRunRecord[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=*&order=started_at.desc&limit=${limit}`);
  const parsed = z.array(RowSchema).safeParse(rows);
  return parsed.success ? parsed.data.map(fromRow) : [];
}
