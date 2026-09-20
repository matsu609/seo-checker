/**
 * 月次レポートの保存（Supabase の monthly_reports テーブル）。サーバー専用。利用者 × 月で 1 行。
 *
 * SQL（Supabase SQL Editor で 1 回）:
 *   create table if not exists monthly_reports (
 *     user_id text not null,
 *     month text not null,
 *     report jsonb not null,
 *     created_at timestamptz not null default now(),
 *     emailed_at timestamptz,
 *     primary key (user_id, month)
 *   );
 *   alter table monthly_reports enable row level security;
 */
import { z } from "zod";
import { eq } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import type { MonthlyReport } from "./types";

const TABLE = "monthly_reports";

export async function saveMonthlyReport(userId: string, report: MonthlyReport, at = new Date()): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?on_conflict=user_id,month`, {
    method: "POST",
    body: { user_id: userId, month: report.month, report, created_at: at.toISOString() },
    prefer: "return=minimal,resolution=merge-duplicates",
  });
}

export async function getMonthlyReport(userId: string, month: string): Promise<MonthlyReport | null> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=report&user_id=${eq(userId)}&month=${eq(month)}&limit=1`);
  const parsed = z.array(z.object({ report: z.unknown() })).safeParse(rows);
  if (!parsed.success || !parsed.data[0]) return null;
  return parsed.data[0].report as MonthlyReport;
}

/** 保存してある月（新しい順） */
export async function listReportMonths(userId: string): Promise<string[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=month&user_id=${eq(userId)}&order=month.desc&limit=36`);
  const parsed = z.array(z.object({ month: z.string() })).safeParse(rows);
  return parsed.success ? parsed.data.map((r) => r.month) : [];
}

export async function markReportEmailed(userId: string, month: string, at = new Date()): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?user_id=${eq(userId)}&month=${eq(month)}`, { method: "PATCH", body: { emailed_at: at.toISOString() }, prefer: "return=minimal" });
}
