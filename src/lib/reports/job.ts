/**
 * 月次レポート（毎月 1 日 5:00 JST。日次 Cron の中で動く）。サーバー専用。
 *
 * 前月分を利用者ごとに作って保存し、設定でメールを受け取る人には送る。外部 API は叩かない。
 *
 * **同じ月を 2 回知らせない**（2026-09-23）。以前は送った印を見ずに全員へ送っていたので、
 * マスター画面の「今すぐ実行」・Cron の再送のたびに全員へ同じメールとお知らせが届いた。
 * いまは「その月のお知らせがもうある人」は作り直さずに飛ばす（時間切れの日の続きにもなる）。
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
import { hasMonthlyReportNotice, markReportEmailed, reportLink, saveMonthlyReport } from "./store";
import type { MonthlyReport } from "./types";

export interface ReportJobDeps {
  /** 対象の利用者（設定にホームページがある人 + MEO の自店舗がある人） */
  listUserIds: () => Promise<string[]>;
  access: typeof loadUserAccess;
  /** その月をもう知らせたか */
  alreadyNotified: (userId: string, month: string) => Promise<boolean>;
  generate: (userId: string, month: string, options: { now: Date; notify: boolean }) => Promise<MonthlyReport>;
}

export function defaultReportJobDeps(): ReportJobDeps {
  return {
    listUserIds: async () => {
      const ids = new Set<string>();
      for (const u of await listStoreValues(PROJECTS_STORE)) ids.add(u.userId);
      try {
        for (const id of await listOwnStoreUserIds()) ids.add(id);
      } catch {
        // MEO 未使用
      }
      return [...ids];
    },
    access: loadUserAccess,
    alreadyNotified: hasMonthlyReportNotice,
    generate: generateReportFor,
  };
}

/** 1 人分を作って保存する（画面の「今すぐ作る」も同じ入口）。notify で知らせも出す */
export async function generateReportFor(userId: string, month: string, options: { now?: Date; notify?: boolean } = {}): Promise<MonthlyReport> {
  const now = options.now ?? new Date();
  const sources = await collectReportSources(userId, month);
  const report = buildMonthlyReport(sources, month, now);
  await saveMonthlyReport(userId, report, now);
  // もう知らせた月は知らせ直さない（読めなければ知らせる側に倒す: 届かないより重複のほうがまし）
  const notified = options.notify ? await hasMonthlyReportNotice(userId, month).catch(() => false) : false;
  if (options.notify && !notified) {
    const label = monthLabel(month);
    const result = await notifyUser(userId, {
      kind: "monthly_report",
      title: `${label}の月次レポートができました`,
      body: report.summary.join("\n"),
      mailText: reportMailText(report, label),
      link: reportLink(month),
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

export async function runMonthlyReport(ctx: JobContext, deps: ReportJobDeps = defaultReportJobDeps()): Promise<JobResult> {
  const month = previousMonthKey(jstMonthKey(ctx.now));
  const ids = await deps.listUserIds();
  const summary = { month, users: ids.length, generated: 0, alreadySent: 0, skippedPlan: 0, failed: 0 };
  let aborted = false;
  for (const userId of ids) {
    if (ctx.remainingMs() < 20_000) {
      aborted = true;
      break;
    }
    try {
      // 知らせ済みの人は作り直さない（送ったものと画面の中身を変えない・二重に送らない）
      if (await deps.alreadyNotified(userId, month)) {
        summary.alreadySent += 1;
        continue;
      }
      const access = await deps.access(userId);
      if (!accessAllows(access, "reports")) {
        summary.skippedPlan += 1;
        continue;
      }
      await deps.generate(userId, month, { now: ctx.now, notify: true });
      summary.generated += 1;
    } catch (err) {
      summary.failed += 1;
      console.error("[monthly-report] 失敗", userId, err instanceof Error ? err.message : err);
    }
  }
  return { summary, aborted };
}
