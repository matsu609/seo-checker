/**
 * 精密診断の自動再診断（毎日。前回から 30 日たったサイトを 1 日 1 件まで）。サーバー専用。
 *
 * 前回の診断と同じ条件（キーワード・競合・業種）で収集し直し、直った点・悪化した点を知らせる。
 * AI のアドバイスは作らない（費用と時間。画面の「アドバイスを作り直す」で作れる）。
 * 月の回数制限は消費しない（countThisMonth が auto を除く）。
 */
import { fetchDueCandidates, pickDue, type ReanalysisCandidate } from "./reanalysis";
import { collectFactSheet } from "./collect";
import { diffSheets, type SheetDiff } from "./diff";
import { AnalysisInputSchema, normalizeInput } from "./input";
import { createFailedRun, createRun, getRun, previousRun } from "./runs";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { getUserStore } from "@/lib/db/user-stores";
import { PROJECTS_STORE } from "@/lib/settings/shared";
import { ProjectsSchema } from "@/lib/store/projects";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";

/** 1 回の Cron で診断するサイト数（1 件で 2〜4 分かかる） */
export const MAX_SITES_PER_RUN = 1;
/** 収集に使ってよい時間（Cron 全体の残りから引く） */
const COLLECT_RESERVE_MS = 20_000;

function hostOf(origin: string): string {
  try {
    return new URL(origin).hostname.replace(/^www\./, "");
  } catch {
    return origin;
  }
}

/** 知らせの文面（純粋） */
export function buildReanalysisNotice(origin: string, diff: SheetDiff | null): { title: string; body: string } {
  const host = hostOf(origin);
  if (!diff) return { title: `${host} の月次の再診断が終わりました`, body: "前回の診断が無いため比較はありません。報告書は精密診断の履歴から開けます。" };
  const lines = [diff.headline];
  if (diff.improved.length > 0) lines.push("", "直った点:", ...diff.improved.slice(0, 5).map((i) => `・${i.label}: ${i.before} → ${i.after}`));
  if (diff.worsened.length > 0) lines.push("", "悪化した点:", ...diff.worsened.slice(0, 5).map((i) => `・${i.label}: ${i.before} → ${i.after}`));
  lines.push("", "アドバイスが要るときは、精密診断の履歴からこの診断を開いて「アドバイスを作り直す」を押してください。");
  return { title: `${host} の月次の再診断: ${diff.headline}`, body: lines.join("\n") };
}

/** その利用者がいまも設定に登録しているサイトか（外したサイトを診断し続けない） */
async function stillRegistered(userId: string, origin: string): Promise<boolean> {
  const projects = ProjectsSchema.safeParse(await getUserStore(userId, PROJECTS_STORE));
  if (!projects.success) return false;
  const host = hostOf(origin);
  return projects.data.some((p) => p.domain === host || hostOf(p.startUrl) === host);
}

export async function reanalyzeSite(candidate: ReanalysisCandidate, options: { now: Date; deadline: number; signal?: AbortSignal }): Promise<{ ok: boolean; diff: SheetDiff | null; reason?: string }> {
  const parsedInput = AnalysisInputSchema.safeParse(candidate.input);
  if (!parsedInput.success) return { ok: false, diff: null, reason: "前回の入力を読めませんでした" };
  const input = { ...normalizeInput(parsedInput.data), source: "auto" as const };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(10_000, options.deadline - Date.now() - COLLECT_RESERVE_MS));
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  try {
    const { sheet, audit } = await collectFactSheet(input, { signal: controller.signal });
    const run = await createRun({ userId: candidate.userId, input, origin: sheet.site.origin, sheet, audit });
    const prev = await previousRun(candidate.userId, sheet.site.origin, run.createdAt, run.id);
    let diff: SheetDiff | null = null;
    if (prev) {
      const prevDetail = await getRun(candidate.userId, prev.id);
      if (prevDetail) diff = diffSheets(prevDetail.sheet, sheet, { prev: prevDetail.audit, next: audit });
    }
    const notice = buildReanalysisNotice(sheet.site.origin, diff);
    await notifyUser(candidate.userId, { kind: "seo_rediagnosis", title: notice.title, body: notice.body, link: "/tools/seo-analysis", channel: "alert" });
    return { ok: true, diff };
  } catch (err) {
    const reason = controller.signal.aborted ? "時間内に収集が終わりませんでした（自動再診断）" : err instanceof Error ? err.message : "収集に失敗しました";
    try {
      await createFailedRun({ userId: candidate.userId, input, origin: candidate.origin, reason });
    } catch {
      // 記録できなくても次回に回るだけ
    }
    return { ok: false, diff: null, reason };
  } finally {
    clearTimeout(timer);
  }
}

export async function runSeoReanalysis(ctx: JobContext): Promise<JobResult> {
  if (!isAnthropicEnabled()) {
    // 収集だけなら AI は要らないが、精密診断の機能自体が ANTHROPIC_API_KEY を前提にしている（画面と同じ条件）
    return { summary: { skipped: "ANTHROPIC_API_KEY が未設定" } };
  }
  const candidates = pickDue(await fetchDueCandidates(), ctx.now);
  const summary = { due: candidates.length, done: 0, failed: 0, skippedPlan: 0, skippedUnregistered: 0, deferred: 0 };
  let done = 0;
  for (const c of candidates) {
    if (done >= MAX_SITES_PER_RUN) {
      summary.deferred += 1;
      continue;
    }
    if (ctx.remainingMs() < 150_000) {
      summary.deferred += 1;
      continue;
    }
    const access = await loadUserAccess(c.userId);
    if (!accessAllows(access, "seo-analysis")) {
      summary.skippedPlan += 1;
      continue;
    }
    if (!(await stillRegistered(c.userId, c.origin))) {
      summary.skippedUnregistered += 1;
      continue;
    }
    const result = await reanalyzeSite(c, { now: ctx.now, deadline: ctx.deadline, signal: ctx.signal });
    done += 1;
    if (result.ok) summary.done += 1;
    else {
      summary.failed += 1;
      console.error("[seo-reanalysis] 失敗", c.userId, c.origin, result.reason);
    }
  }
  return { summary, aborted: summary.deferred > 0 };
}
