/**
 * サイトの事故監視（毎週水曜 5:00 JST。日次 Cron の中で動く）。サーバー専用。
 *
 * 設定にホームページを登録している利用者ごとに: 主要ページ（直近の精密診断の重要ページ）を確認 →
 * 前回との差分 → 新しく起きた事故を知らせる → 保存。自社サイトへのアクセスだけで実費は出ない。
 */
import { z } from "zod";
import { getUserStore, listStoreValues } from "@/lib/db/user-stores";
import { RESUME_KEY, startFromCursor } from "@/lib/jobs/cursor";
import { lastResumeCursor } from "@/lib/jobs/runs";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { listTopPages } from "@/lib/seo-analysis/runs";
import { CURRENT_PROJECT_STORE, PROJECTS_STORE } from "@/lib/settings/shared";
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

/**
 * 監視するサイトの URL（純関数）。**画面の「今すぐ確認」・月次レポートと同じ「いまのホームページ」**
 * （設定で選んでいるもの。currentProjectId）を見る。以前は定期実行だけ常に 1 件目を見ていて、
 * ホームページを複数登録して 2 件目を選んでいる人は、画面と別のサイトを監視していた（2026-09-23）。
 */
export function monitorTargetUrl(projectsValue: unknown, currentProjectId: unknown): string {
  const projects = ProjectsSchema.safeParse(projectsValue);
  const current = z.string().nullable().safeParse(currentProjectId);
  const project = projects.success ? resolveCurrentProject(projects.data, current.success ? current.data : null) : null;
  return project?.startUrl || (project?.domain ? `https://${project.domain}/` : "");
}

export interface MonitorJobDeps {
  listUsers: () => Promise<{ userId: string; value: unknown }[]>;
  currentProjectId: (userId: string) => Promise<unknown>;
  access: typeof loadUserAccess;
  monitor: typeof monitorUserSite;
  /** 前回どこまで回れたか（次に始める利用者の ID） */
  cursor: () => Promise<string | null>;
}

export function defaultMonitorJobDeps(): MonitorJobDeps {
  return {
    listUsers: () => listStoreValues(PROJECTS_STORE),
    currentProjectId: (userId) => getUserStore(userId, CURRENT_PROJECT_STORE),
    access: loadUserAccess,
    monitor: monitorUserSite,
    cursor: () => lastResumeCursor("site-monitor"),
  };
}

export async function runSiteMonitor(ctx: JobContext, deps: MonitorJobDeps = defaultMonitorJobDeps()): Promise<JobResult> {
  // 前回たどり着けなかった人から始める（毎週同じ人が時間切れで切られないように。2026-09-23）
  const users = startFromCursor(await deps.listUsers(), (u) => u.userId, await deps.cursor().catch(() => null));
  const summary = { users: users.length, checked: 0, incidents: 0, alerts: 0, skippedPlan: 0, skippedEmpty: 0, failed: 0 };
  let aborted = false;
  let nextStart: string | null = null;
  for (const u of users) {
    if (ctx.remainingMs() < 30_000) {
      aborted = true;
      nextStart = u.userId;
      break;
    }
    try {
      const siteUrl = monitorTargetUrl(u.value, await deps.currentProjectId(u.userId));
      if (!siteUrl) {
        summary.skippedEmpty += 1;
        continue;
      }
      const access = await deps.access(u.userId);
      if (!accessAllows(access, "monitor")) {
        summary.skippedPlan += 1;
        continue;
      }
      const { snapshot, diff } = await deps.monitor(u.userId, siteUrl, { now: ctx.now, deadline: Math.min(ctx.deadline, Date.now() + PER_USER_MS), signal: ctx.signal });
      summary.checked += 1;
      summary.incidents += snapshot.incidents.length;
      if (diff.opened.length > 0) summary.alerts += 1;
    } catch (err) {
      summary.failed += 1;
      console.error("[site-monitor] 失敗", u.userId, err instanceof Error ? err.message : err);
    }
  }
  return { summary: nextStart ? { ...summary, [RESUME_KEY]: nextStart } : summary, aborted };
}
