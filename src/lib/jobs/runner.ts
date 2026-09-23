/**
 * ジョブを順に動かす（I/O はジョブの中。ここは順番・時間・記録だけ）。サーバー専用。
 *
 * - due でないジョブは飛ばす（force で無視できる。マスター画面の「今すぐ実行」用）
 * - 月次のジョブ（取り返しあり）は、今月もう最後まで終わっていれば飛ばす（force なら動かす）
 * - 残り時間が minBudgetMs を切ったら、そのジョブは今日は飛ばす（次回に回る）。**飛ばしたことも記録する**
 * - maxBudgetMs があれば、そのジョブにはそれ以上の時間を渡さない（後ろのジョブの時間を残す）
 * - 1 本の失敗で後ろを止めない。結果は cron_runs に残す
 */
import { completedSince, finishRun, recordSkipped, startRun } from "./runs";
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
  /** 今月もう済んだか（テスト用に差し替えられる。既定は cron_runs を見る。record: false なら「済んでいない」） */
  completedSince?: (job: JobId, since: string) => Promise<boolean>;
  /** 飛ばしたことを残す（テスト用に差し替えられる。既定は cron_runs。record: false なら残さない） */
  recordSkipped?: (job: JobId, reason: string) => Promise<void>;
}

export async function runJobs(definitions: readonly JobDefinition[], options: RunJobsOptions): Promise<JobOutcome[]> {
  const now = options.now ?? new Date();
  const started = Date.now();
  const deadline = started + options.budgetMs;
  const due = new Set(options.only ?? dueJobs(now));
  const outcomes: JobOutcome[] = [];
  const record = options.record ?? true;
  const isCompleted = options.completedSince ?? (record ? completedSince : async () => false);
  const noteSkipped = options.recordSkipped ?? (record ? (job: JobId, reason: string) => recordSkipped(job, reason, new Date()) : async () => {});

  for (const def of definitions) {
    const forced = options.force === true && (options.only?.includes(def.id) ?? false);
    if (!due.has(def.id) && !forced) continue;
    const schedule = scheduleOf(def.id);

    // 月次のジョブ: 予定日から数日は取り返すが、今月もう終わっていれば動かさない（2026-09-23）。
    // 「済んだ」の飛ばしは記録しない（マスター画面の「前回の内容」が、実際に動いた回のまま見えるように）
    if (!forced && schedule.catchUpSince) {
      const since = schedule.catchUpSince(now).toISOString();
      if (await isCompleted(def.id, since)) {
        outcomes.push({ job: def.id, status: "skipped", summary: {}, ms: 0, reason: "今月はもう済んでいます" });
        continue;
      }
    }

    const remaining = deadline - Date.now();
    if (remaining < schedule.minBudgetMs) {
      const reason = `残り時間が足りません（${Math.round(remaining / 1000)} 秒）`;
      outcomes.push({ job: def.id, status: "skipped", summary: {}, ms: 0, reason });
      // 以前は記録に残らず、マスター画面では「動いていない」のか「飛ばされた」のか区別できなかった
      await noteSkipped(def.id, reason);
      continue;
    }
    const jobStarted = Date.now();
    const runId = record ? await startRun(def.id, new Date(jobStarted)) : null;
    const jobDeadline = schedule.maxBudgetMs ? Math.min(deadline, jobStarted + schedule.maxBudgetMs) : deadline;
    const ctx: JobContext = { now, deadline: jobDeadline, signal: options.signal, remainingMs: () => jobDeadline - Date.now() };
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
