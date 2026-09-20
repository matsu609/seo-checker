/**
 * GET /api/admin/jobs … 定期処理の一覧（予定・次回・最近の実行記録）。運用者だけ。
 */
import { requireAdmin } from "@/lib/admin/guard";
import { isCronConfigured } from "@/lib/auth/cron";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { listRecentRuns, type JobRunRecord } from "@/lib/jobs/runs";
import { JOB_SCHEDULE } from "@/lib/jobs/schedule";
import type { JobId } from "@/lib/jobs/types";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";

export interface AdminJobItem {
  id: JobId;
  label: string;
  description: string;
  cadence: string;
  nextAt: string;
  last: JobRunRecord | null;
}

export interface AdminJobsResponse {
  cronConfigured: boolean;
  dbConfigured: boolean;
  jobs: AdminJobItem[];
  recent: JobRunRecord[];
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const now = new Date();
  let recent: JobRunRecord[] = [];
  if (isSupabaseConfigured()) {
    try {
      recent = await listRecentRuns(60);
    } catch {
      recent = [];
    }
  }
  const jobs: AdminJobItem[] = JOB_SCHEDULE.map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
    cadence: s.cadence,
    nextAt: s.next(now).toISOString(),
    last: recent.find((r) => r.job === s.id) ?? null,
  }));
  const body: AdminJobsResponse = { cronConfigured: isCronConfigured(), dbConfigured: isSupabaseConfigured(), jobs, recent };
  return Response.json(body, { headers: NO_STORE });
}
