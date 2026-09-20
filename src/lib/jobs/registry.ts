/**
 * 定期処理の「本物の依存」を組み立てた一覧（サーバー専用）。順番は schedule.ts と同じ。
 *
 * ジョブの中身は各機能のフォルダにある（rank/job.ts・monitor/job.ts …）。ここは束ねるだけ。
 */
import { runMapsRefresh } from "@/lib/maps/refresh-job";
import { runSiteMonitor } from "@/lib/monitor/job";
import { runRankWeekly } from "@/lib/rank/job";
import { runListingsRecheck } from "@/lib/listings/job";
import { runGbpPosts } from "@/lib/posts/job";
import { runMonthlyReport } from "@/lib/reports/job";
import { runSeoReanalysis } from "@/lib/seo-analysis/job";
import type { JobDefinition } from "./runner";
import { JOB_SCHEDULE } from "./schedule";
import type { JobId } from "./types";

const RUNNERS: Record<JobId, JobDefinition["run"]> = {
  "gbp-posts": runGbpPosts,
  "maps-refresh": async (ctx) => {
    const summary = await runMapsRefresh({ budgetMs: Math.max(30_000, ctx.remainingMs() - 10_000), signal: ctx.signal });
    return { summary: { ...summary }, aborted: summary.aborted !== null || summary.remaining > 0 };
  },
  "rank-weekly": runRankWeekly,
  "site-monitor": runSiteMonitor,
  "listings-recheck": runListingsRecheck,
  "monthly-report": runMonthlyReport,
  "seo-reanalysis": runSeoReanalysis,
};

export function jobDefinitions(): JobDefinition[] {
  return JOB_SCHEDULE.map((s) => ({ id: s.id, run: RUNNERS[s.id] }));
}
