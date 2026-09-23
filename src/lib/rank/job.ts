/**
 * 順位計測の自動化（毎週火曜 5:00 JST。日次 Cron の中で動く）。サーバー専用。
 *
 * 利用者ごとに: 設定のキーワード（user_stores の写し）→ プランの上限まで → SerpApi で計測 →
 * rank_snapshots に保存 → 前回より大きく下がった語があれば知らせる。
 * 契約が無い人（プランが足りない人）は測らない（実費が出るため）。
 *
 * 2026-09-23 に直したこと:
 *   - 1 人ぶんの処理（設定の読み込み・履歴・保存・知らせ）を利用者ごとに try で囲む。
 *     以前は 1 人の Supabase のエラーで、その週の全員ぶんが止まっていた
 *   - 今日すでに測った語は測り直さない。同じ日に 2 回動くと（「今すぐ実行」・Cron の再送）、
 *     SerpApi の実費と「急落」の知らせが二重になっていた（前回の値は「今日より前」から取るため）
 *   - 前回たどり着けなかった人から始める。以前は毎週「更新が新しい順」で回し、
 *     時間切れで切られる後ろの人は毎週切られ続けていた（実行記録の summary に続きを残す）
 */
import { listStoreValues, getUserStore } from "@/lib/db/user-stores";
import { RESUME_KEY, startFromCursor } from "@/lib/jobs/cursor";
import { lastResumeCursor } from "@/lib/jobs/runs";
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
  /** 前回どこまで回れたか（次に始める利用者の ID） */
  cursor: () => Promise<string | null>;
  /** 計測（テスト用に差し替えられる） */
  measure?: typeof measureBatch;
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
    cursor: () => lastResumeCursor("rank-weekly"),
  };
}

export async function runRankWeekly(ctx: JobContext, deps: RankJobDeps = defaultRankJobDeps()): Promise<JobResult> {
  if (!deps.provider) return { summary: { skipped: "SERPAPI_KEY が未設定" } };
  const provider = deps.provider;
  const measure = deps.measure ?? measureBatch;
  // 前回の続きから（ID の順に並べて一周する）
  const users = startFromCursor(await deps.listUsers(), (u) => u.userId, await deps.cursor().catch(() => null));
  const takenOn = jstDateKey(ctx.now);
  const summary = { users: users.length, measured: 0, failed: 0, alerts: 0, skippedPlan: 0, skippedEmpty: 0, alreadyMeasured: 0, userErrors: 0 };
  let aborted = false;
  let nextStart: string | null = null;

  for (const u of users) {
    if (ctx.remainingMs() < 20_000) {
      aborted = true;
      nextStart = u.userId;
      break;
    }
    try {
      const access = await deps.access(u.userId);
      if (!accessAllows(access, "rank")) {
        summary.skippedPlan += 1;
        continue;
      }
      const stores = await deps.loadStores(u.userId);
      const targets = selectAutoTargets({ projects: stores.projects, rankKeywords: u.value }, rankAutoLimit(access.plan, access.admin));
      if (targets.length === 0) {
        summary.skippedEmpty += 1;
        continue;
      }
      const history = await deps.history(u.userId, { sinceDate: jstDateKey(new Date(ctx.now.getTime() - 120 * 24 * 60 * 60 * 1000)) });
      // 今日すでに測った語は測り直さない（実費と知らせを二重にしない）
      const measuredToday = new Set(history.filter((s) => s.takenOn === takenOn).map((s) => s.keywordId));
      const pending = targets.filter((t) => !measuredToday.has(t.keyword.id));
      if (pending.length === 0) {
        summary.alreadyMeasured += 1;
        continue;
      }
      const deadline = Math.min(ctx.deadline - 10_000, Date.now() + PER_USER_MS);
      const { items, fatal } = await measure(
        provider,
        pending.map((t) => ({ keyword: t.keyword.keyword, device: t.keyword.device, location: t.keyword.location, projectDomain: t.projectDomain, competitorDomains: t.competitorDomains })),
        { concurrency: CONCURRENCY, deadline, signal: ctx.signal },
      );
      const saved = [];
      for (let i = 0; i < pending.length; i++) {
        const item = items[i];
        if (!item) continue;
        if (!item.ok) {
          summary.failed += 1;
          continue;
        }
        saved.push(toSnapshot(pending[i].keyword.id, item, takenOn));
      }
      if (saved.length > 0) {
        await deps.save(u.userId, saved);
        summary.measured += saved.length;
        const drops = detectRankDrops(saved, previousByKeyword(history, takenOn), pending.map((t) => t.keyword));
        if (drops.length > 0) {
          const domain = pending[0].projectDomain;
          const alert = buildRankAlert(domain, drops);
          await deps.notify(u.userId, { kind: "rank_drop", title: alert.title, body: alert.body, link: "/tools/rank", channel: "alert" });
          summary.alerts += 1;
        }
      }
      if (fatal) {
        // 鍵・上限の問題は全員に同じように起きる。ここで止めて次回に回す（次回はこの人から）
        return { summary: { ...summary, fatal: fatal.message, [RESUME_KEY]: u.userId }, aborted: true };
      }
    } catch (err) {
      // 1 人の失敗（Supabase の一時的なエラーなど）で全員ぶんを止めない
      summary.userErrors += 1;
      console.error("[rank-weekly] 失敗", u.userId, err instanceof Error ? err.message : err);
    }
  }
  return { summary: nextStart ? { ...summary, [RESUME_KEY]: nextStart } : summary, aborted };
}
