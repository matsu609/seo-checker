/**
 * GET /api/monitor … サイトの事故監視の最新の結果（最新と前回の差分・履歴・次回の予定）。ログイン必須。
 */
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { scheduleOf } from "@/lib/jobs/schedule";
import { diffIncidents } from "@/lib/monitor/checks";
import { latestSnapshots, listSnapshots, type MonitorHistoryItem } from "@/lib/monitor/store";
import type { MonitorDiff, MonitorSnapshot } from "@/lib/monitor/types";
import { loadSharedSettings } from "@/lib/settings/server";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface MonitorResponse {
  enabled: boolean;
  siteUrl: string | null;
  latest: MonitorSnapshot | null;
  diff: MonitorDiff | null;
  history: MonitorHistoryItem[];
  nextRunAt: string;
}

export async function GET() {
  const userId = await requireUser({ feature: "monitor" });
  if (userId instanceof Response) return userId;
  const nextRunAt = scheduleOf("site-monitor").next(new Date()).toISOString();
  if (!isSupabaseConfigured()) {
    const body: MonitorResponse = { enabled: false, siteUrl: null, latest: null, diff: null, history: [], nextRunAt };
    return Response.json(body, { headers: NO_STORE });
  }
  try {
    const settings = await loadSharedSettings(userId);
    const project = settings.project;
    const siteUrl = project?.startUrl || (project?.domain ? `https://${project.domain}/` : null);
    if (!siteUrl) {
      const body: MonitorResponse = { enabled: true, siteUrl: null, latest: null, diff: null, history: [], nextRunAt };
      return Response.json(body, { headers: NO_STORE });
    }
    const origin = new URL(siteUrl).origin;
    const [snaps, history] = await Promise.all([latestSnapshots(userId, origin, 2), listSnapshots(userId, origin)]);
    const latest = snaps[0] ?? null;
    const diff = latest ? diffIncidents(snaps[1] ? snaps[1].incidents : null, latest.incidents) : null;
    const body: MonitorResponse = { enabled: true, siteUrl, latest, diff, history, nextRunAt };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
