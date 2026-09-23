/**
 * 定期処理（ジョブ）の型。クライアントでも読める（マスター画面の一覧に使う）。
 *
 * Vercel の Hobby プランは Cron が 2 本までなので、日次の 1 本（/api/cron/daily）に
 * すべてのジョブを載せ、曜日・日付で振り分ける（AI 検索モニタリングだけは元からの 1 本）。
 */
export const JOB_IDS = ["gbp-posts", "maps-refresh", "rank-weekly", "site-monitor", "listings-recheck", "monthly-report", "seo-reanalysis"] as const;

export type JobId = (typeof JOB_IDS)[number];

/**
 * cron_runs に記録する処理の名前。日次 Cron のジョブに加えて、別の Cron で動く
 * AI 検索モニタリング（/api/cron/geo-run）も記録する（前回どこまで回れたかを残すため。2026-09-23）
 */
export type RecordedJob = JobId | "geo-run";

export type JobRunStatus = "ok" | "failed" | "aborted" | "skipped";

export interface JobOutcome {
  job: JobId;
  status: JobRunStatus;
  /** 何をしたか（件数など。画面にそのまま出す） */
  summary: Record<string, unknown>;
  /** 所要時間 */
  ms: number;
  /** skipped のときの理由 */
  reason?: string;
}

export interface JobContext {
  now: Date;
  /** この時刻（epoch ms）までに終える */
  deadline: number;
  signal?: AbortSignal;
  /** 残り時間（ms） */
  remainingMs(): number;
}

export interface JobResult {
  summary: Record<string, unknown>;
  /** 時間切れなどで途中で止めた（残りは次回） */
  aborted?: boolean;
}
