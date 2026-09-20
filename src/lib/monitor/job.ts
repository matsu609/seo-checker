/**
 * サイトの事故監視（毎週水曜 5:00 JST。日次 Cron の中で動く）。サーバー専用。
 *
 * 設定にホームページを登録している利用者ごとに: 主要ページ（直近の精密診断の重要ページ）を確認 →
 * 前回との差分 → 新しく起きた事故を知らせる → 保存。自社サイトへのアクセスだけで実費は出ない。
 */
import { listStoreValues } from "@/lib/db/user-stores";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { listTopPages } from "@/lib/seo-analysis/runs";
import { PROJECTS_STORE } from "@/lib/settings/shared";
import { ProjectsSchema, resolveCurrentProject } from "@/lib/store/projects";
import { buildIncidentAlert, diffIncidents } from "./checks";
import { checkSite } from "./run";
import { latestSnapshots, saveSnapshot } from "./store";
import type { MonitorDiff, MonitorSnapshot } from "./types";

const PER_USER_MS = 60_000;

/** 1 人分を確認して保存し、差分を返す（画面の「今すぐ確認」も同じ入口） */
export async function monitorUserSite(userId: string, siteUrl: string, options: { now?: Date; deadline?: number; signal?: AbortSignal; notify?: boolean } = {}): Promise<{ snapshot: MonitorSnapshot; diff: MonitorDiff }> {
  const now = options.now ?? new Date();
  const origin = new URL(siteUrl).origin;
  let keyPages: string[] = [];
  try {
    keyPages = await listTopPages(userId, origin);
  } catch {
    keyPages = [];
  }
  const snapshot = await checkSite(siteUrl, { keyPages, now, deadline: options.deadline, signal: options.signal });
  const previous = (await latestSnapshots(userId, snapshot.origin, 1))[0] ?? null;
  const diff = diffIncidents(previous ? previous.incidents : null, snapshot.incidents);
  await saveSnapshot(userId, snapshot);
  if (options.notify !== false && diff.opened.length > 0) {
    const alert = buildIncidentAlert(snapshot.origin, diff.opened, diff.resolved);
    await notifyUser(userId, { kind: "site_incident", title: alert.title, body: alert.body, link: "/tools/monitor", channel: "alert" });
  }
  return { snapshot, diff };
}

export async function runSiteMonitor(ctx: JobContext): Promise<JobResult> {
  const users = await listStoreValues(PROJECTS_STORE);
  const summary = { users: users.length, checked: 0, incidents: 0, alerts: 0, skippedPlan: 0, skippedEmpty: 0, failed: 0 };
  let aborted = false;
  for (const u of users) {
    if (ctx.remainingMs() < 30_000) {
      aborted = true;
      break;
    }
    const projects = ProjectsSchema.safeParse(u.value);
    const project = projects.success ? resolveCurrentProject(projects.data, null) : null;
    const siteUrl = project?.startUrl || (project?.domain ? `https://${project.domain}/` : "");
    if (!siteUrl) {
      summary.skippedEmpty += 1;
      continue;
    }
    const access = await loadUserAccess(u.userId);
    if (!accessAllows(access, "monitor")) {
      summary.skippedPlan += 1;
      continue;
    }
    try {
      const { snapshot, diff } = await monitorUserSite(u.userId, siteUrl, { now: ctx.now, deadline: Math.min(ctx.deadline, Date.now() + PER_USER_MS), signal: ctx.signal });
      summary.checked += 1;
      summary.incidents += snapshot.incidents.length;
      if (diff.opened.length > 0) summary.alerts += 1;
    } catch (err) {
      summary.failed += 1;
      console.error("[site-monitor] 失敗", u.userId, err instanceof Error ? err.message : err);
    }
  }
  return { summary, aborted };
}
