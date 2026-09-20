/**
 * 順位計測の自動化（毎週火曜 5:00 JST。日次 Cron の中で動く）。サーバー専用。
 *
 * 利用者ごとに: 設定のキーワード（user_stores の写し）→ プランの上限まで → SerpApi で計測 →
 * rank_snapshots に保存 → 前回より大きく下がった語があれば知らせる。
 * 契約が無い人（プランが足りない人）は測らない（実費が出るため）。
 */
import { listStoreValues, getUserStore } from "@/lib/db/user-stores";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { getSerpProvider } from "@/lib/serp";
import { CURRENT_PROJECT_STORE, PROJECTS_STORE, RANK_KEYWORDS_STORE } from "@/lib/settings/shared";
import { jstDateKey } from "@/lib/time/jst";
import { buildRankAlert, detectRankDrops, previousByKeyword, rankAutoLimit, selectAutoTargets } from "./auto";
import { measureBatch } from "./measure-batch";
import { listRankSnapshots, saveRankSnapshots } from "./server-store";
import { toSnapshot } from "./store";

/** 1 人に使ってよい時間（多くの利用者を 1 回で回すため） */
const PER_USER_MS = 90_000;
const CONCURRENCY = 3;

export interface RankJobDeps {
  listUsers: () => Promise<{ userId: string; value: unknown }[]>;
  loadStores: (userId: string) => Promise<{ projects: unknown; currentProjectId: unknown }>;
  access: typeof loadUserAccess;
  provider: ReturnType<typeof getSerpProvider>;
  history: typeof listRankSnapshots;
  save: typeof saveRankSnapshots;
  notify: typeof notifyUser;
}

export function defaultRankJobDeps(): RankJobDeps {
  return {
    listUsers: () => listStoreValues(RANK_KEYWORDS_STORE),
    loadStores: async (userId) => ({ projects: await getUserStore(userId, PROJECTS_STORE), currentProjectId: await getUserStore(userId, CURRENT_PROJECT_STORE) }),
    access: loadUserAccess,
    provider: getSerpProvider(),
    history: listRankSnapshots,
    save: saveRankSnapshots,
    notify: notifyUser,
  };
}

export async function runRankWeekly(ctx: JobContext, deps: RankJobDeps = defaultRankJobDeps()): Promise<JobResult> {
  if (!deps.provider) return { summary: { skipped: "SERPAPI_KEY が未設定" } };
  const users = await deps.listUsers();
  const takenOn = jstDateKey(ctx.now);
  const summary = { users: users.length, measured: 0, failed: 0, alerts: 0, skippedPlan: 0, skippedEmpty: 0 };
  let aborted = false;

  for (const u of users) {
    if (ctx.remainingMs() < 20_000) {
      aborted = true;
      break;
    }
    const access = await deps.access(u.userId);
    if (!accessAllows(access, "rank")) {
      summary.skippedPlan += 1;
      continue;
    }
    const stores = await deps.loadStores(u.userId);
    const targets = selectAutoTargets({ projects: stores.projects, rankKeywords: u.value }, rankAutoLimit(access.plan, access.admin || access.agency));
    if (targets.length === 0) {
      summary.skippedEmpty += 1;
      continue;
    }
    const deadline = Math.min(ctx.deadline - 10_000, Date.now() + PER_USER_MS);
    const { items, fatal } = await measureBatch(
      deps.provider,
      targets.map((t) => ({ keyword: t.keyword.keyword, device: t.keyword.device, location: t.keyword.location, projectDomain: t.projectDomain, competitorDomains: t.competitorDomains })),
      { concurrency: CONCURRENCY, deadline, signal: ctx.signal },
    );
    const saved = [];
    for (let i = 0; i < targets.length; i++) {
      const item = items[i];
      if (!item) continue;
      if (!item.ok) {
        summary.failed += 1;
        continue;
      }
      saved.push(toSnapshot(targets[i].keyword.id, item, takenOn));
    }
    if (saved.length > 0) {
      const history = await deps.history(u.userId, { sinceDate: jstDateKey(new Date(ctx.now.getTime() - 120 * 24 * 60 * 60 * 1000)) });
      await deps.save(u.userId, saved);
      summary.measured += saved.length;
      const drops = detectRankDrops(saved, previousByKeyword(history, takenOn), targets.map((t) => t.keyword));
      if (drops.length > 0) {
        const domain = targets[0].projectDomain;
        const alert = buildRankAlert(domain, drops);
        await deps.notify(u.userId, { kind: "rank_drop", title: alert.title, body: alert.body, link: "/tools/rank", channel: "alert" });
        summary.alerts += 1;
      }
    }
    if (fatal) {
      // 鍵・上限の問題は全員に同じように起きる。ここで止めて次回に回す
      return { summary: { ...summary, fatal: fatal.message }, aborted: true };
    }
  }
  return { summary, aborted };
}
