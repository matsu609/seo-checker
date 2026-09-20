/**
 * ジョブを順に動かす（I/O はジョブの中。ここは順番・時間・記録だけ）。サーバー専用。
 *
 * - due でないジョブは飛ばす（force で無視できる。マスター画面の「今すぐ実行」用）
 * - 残り時間が minBudgetMs を切ったら、そのジョブは今日は飛ばす（次回に回る）
 * - 1 本の失敗で後ろを止めない。結果は cron_runs に残す
 */
import { finishRun, startRun } from "./runs";
import { dueJobs, scheduleOf } from "./schedule";
import type { JobContext, JobId, JobOutcome, JobResult } from "./types";

export interface JobDefinition {
  id: JobId;
  run(ctx: JobContext): Promise<JobResult>;
}

export interface RunJobsOptions {
  now?: Date;
  /** 全体に使ってよい時間 */
  budgetMs: number;
  /** これだけを動かす（省略時はその日に due のもの） */
  only?: readonly JobId[];
  /** due を無視して動かす */
  force?: boolean;
  signal?: AbortSignal;
  /** 記録を残さない（テスト用） */
  record?: boolean;
}

export async function runJobs(definitions: readonly JobDefinition[], options: RunJobsOptions): Promise<JobOutcome[]> {
  const now = options.now ?? new Date();
  const started = Date.now();
  const deadline = started + options.budgetMs;
  const due = new Set(options.only ?? dueJobs(now));
  const outcomes: JobOutcome[] = [];
  const record = options.record ?? true;

  for (const def of definitions) {
    if (!due.has(def.id) && !(options.force && options.only?.includes(def.id))) continue;
    const schedule = scheduleOf(def.id);
    const remaining = deadline - Date.now();
    if (remaining < schedule.minBudgetMs) {
      outcomes.push({ job: def.id, status: "skipped", summary: {}, ms: 0, reason: `残り時間が足りません（${Math.round(remaining / 1000)} 秒）` });
      continue;
    }
    const jobStarted = Date.now();
    const runId = record ? await startRun(def.id, new Date(jobStarted)) : null;
    const ctx: JobContext = { now, deadline, signal: options.signal, remainingMs: () => deadline - Date.now() };
    try {
      const result = await def.run(ctx);
      const status = result.aborted ? "aborted" : "ok";
      const outcome: JobOutcome = { job: def.id, status, summary: result.summary, ms: Date.now() - jobStarted };
      outcomes.push(outcome);
      await finishRun(runId, status, result.summary);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jobs] ${def.id} が失敗`, message);
      outcomes.push({ job: def.id, status: "failed", summary: { error: message }, ms: Date.now() - jobStarted });
      await finishRun(runId, "failed", { error: message });
    }
  }
  return outcomes;
}
