/**
 * GET /api/reports?month=YYYY-MM … 月次レポート（保存済み）と、ある月の一覧、次回の予定。ログイン必須。
 */
import { NO_STORE } from "@/lib/api/headers";
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { scheduleOf } from "@/lib/jobs/schedule";
import { getMonthlyReport, listReportMonths } from "@/lib/reports/store";
import type { MonthlyReport } from "@/lib/reports/types";
import { isMonthKey, jstMonthKey, previousMonthKey } from "@/lib/time/jst";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface ReportsResponse {
  enabled: boolean;
  months: string[];
  month: string;
  report: MonthlyReport | null;
  nextRunAt: string;
  /** 「今すぐ作る」で選べる月（前月と今月） */
  generatable: string[];
}

export async function GET(request: Request) {
  const userId = await requireUser({ feature: "reports" });
  if (userId instanceof Response) return userId;
  const now = new Date();
  const current = jstMonthKey(now);
  const previous = previousMonthKey(current);
  const requested = new URL(request.url).searchParams.get("month");
  const nextRunAt = scheduleOf("monthly-report").next(now).toISOString();
  if (requested !== null && !isMonthKey(requested)) return Response.json({ error: "月の指定が正しくありません" }, { status: 400, headers: NO_STORE });
  if (!isSupabaseConfigured()) {
    const body: ReportsResponse = { enabled: false, months: [], month: requested ?? previous, report: null, nextRunAt, generatable: [previous, current] };
    return Response.json(body, { headers: NO_STORE });
  }
  try {
    const months = await listReportMonths(userId);
    const month = requested ?? months[0] ?? previous;
    const report = await getMonthlyReport(userId, month);
    const body: ReportsResponse = { enabled: true, months, month, report, nextRunAt, generatable: [previous, current] };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
