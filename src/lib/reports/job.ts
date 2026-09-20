/**
 * 月次レポート（毎月 1 日 5:00 JST。日次 Cron の中で動く）。サーバー専用。
 *
 * 前月分を利用者ごとに作って保存し、設定でメールを受け取る人には送る。外部 API は叩かない。
 */
import { listStoreValues } from "@/lib/db/user-stores";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { listOwnStoreUserIds } from "@/lib/maps/stores";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { PROJECTS_STORE } from "@/lib/settings/shared";
import { jstMonthKey, monthLabel, previousMonthKey } from "@/lib/time/jst";
import { buildMonthlyReport, reportMailText } from "./build";
import { collectReportSources } from "./collect";
import { markReportEmailed, saveMonthlyReport } from "./store";
import type { MonthlyReport } from "./types";

/** 1 人分を作って保存する（画面の「今すぐ作る」も同じ入口）。notify で知らせも出す */
export async function generateReportFor(userId: string, month: string, options: { now?: Date; notify?: boolean } = {}): Promise<MonthlyReport> {
  const now = options.now ?? new Date();
  const sources = await collectReportSources(userId, month);
  const report = buildMonthlyReport(sources, month, now);
  await saveMonthlyReport(userId, report, now);
  if (options.notify) {
    const label = monthLabel(month);
    const result = await notifyUser(userId, {
      kind: "monthly_report",
      title: `${label}の月次レポートができました`,
      body: report.summary.join("\n"),
      mailText: reportMailText(report, label),
      link: `/tools/reports?month=${month}`,
      channel: "report",
    });
    if (result.emailed) {
      try {
        await markReportEmailed(userId, month, now);
      } catch {
        // 印だけ
      }
    }
  }
  return report;
}

export async function runMonthlyReport(ctx: JobContext): Promise<JobResult> {
  const month = previousMonthKey(jstMonthKey(ctx.now));
  const ids = new Set<string>();
  for (const u of await listStoreValues(PROJECTS_STORE)) ids.add(u.userId);
  try {
    for (const id of await listOwnStoreUserIds()) ids.add(id);
  } catch {
    // MEO 未使用
  }
  const summary = { month, users: ids.size, generated: 0, skippedPlan: 0, failed: 0 };
  let aborted = false;
  for (const userId of ids) {
    if (ctx.remainingMs() < 20_000) {
      aborted = true;
      break;
    }
    const access = await loadUserAccess(userId);
    if (!accessAllows(access, "reports")) {
      summary.skippedPlan += 1;
      continue;
    }
    try {
      await generateReportFor(userId, month, { now: ctx.now, notify: true });
      summary.generated += 1;
    } catch (err) {
      summary.failed += 1;
      console.error("[monthly-report] 失敗", userId, err instanceof Error ? err.message : err);
    }
  }
  return { summary, aborted };
}
