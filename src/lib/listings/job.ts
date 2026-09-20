/**
 * 掲載の再チェック（毎月 2 日 5:00 JST。日次 Cron の中で動く）。サーバー専用。
 *
 * 掲載済み（live）で URL を控えてある媒体のページを開き、店名・電話・住所が今も出ているかを確かめる。
 * 消えた・ずれたものは知らせる。自社の掲載ページへのアクセスだけで実費は出ない。
 */
import { fetchText } from "@/lib/analyzer/fetch";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { mediaById } from "./media";
import { stateOf, type ListingStates } from "./profile";
import { applyCheck, buildListingAlert, checkFailed, checkNapInText, htmlToText, mediaToCheck, type RecheckLine } from "./recheck";
import { listAllListingProfiles, putListing, type ListingRecord } from "./store";

const PAGE_TIMEOUT_MS = 15_000;

/** 1 店舗分を確認して保存し、行ごとの結果を返す（画面の「今すぐ確認」も同じ入口） */
export async function recheckListing(userId: string, record: ListingRecord, options: { now?: Date; force?: boolean; notify?: boolean; deadline?: number } = {}): Promise<{ record: ListingRecord; lines: RecheckLine[] }> {
  const now = options.now ?? new Date();
  const ids = mediaToCheck(record.states, now, options.force);
  const lines: RecheckLine[] = [];
  const states: ListingStates = { ...record.states };
  for (const mediaId of ids) {
    if (options.deadline && Date.now() > options.deadline) break;
    const state = stateOf(states, mediaId);
    const media = mediaById(mediaId);
    let outcome;
    try {
      const r = await fetchText(state.url, { timeoutMs: PAGE_TIMEOUT_MS, maxBytes: 1_500_000 });
      outcome = r.ok ? checkNapInText(htmlToText(r.body), record.profile) : r.status === 404 || r.status === 410 ? { ...checkFailed(`HTTP ${r.status}`), result: "missing" as const, detail: `ページがありません（HTTP ${r.status}）` } : checkFailed(`HTTP ${r.status}`);
    } catch (err) {
      outcome = checkFailed(err instanceof Error ? err.message : "取得に失敗しました");
    }
    states[mediaId] = applyCheck(state, outcome, now);
    lines.push({ mediaId, mediaName: media?.name ?? mediaId, url: state.url, outcome });
  }
  const saved = lines.length > 0 ? await putListing(userId, record.placeId, record.profile, states, now) : record;
  if (options.notify !== false) {
    const alert = buildListingAlert(record.profile.name || record.placeId, lines);
    if (alert) await notifyUser(userId, { kind: "listing_check", title: alert.title, body: alert.body, link: "/tools/citations", channel: "alert" });
  }
  return { record: saved, lines };
}

export async function runListingsRecheck(ctx: JobContext): Promise<JobResult> {
  const records = await listAllListingProfiles();
  const summary = { stores: records.length, checked: 0, missing: 0, mismatch: 0, error: 0, skippedPlan: 0, skippedNone: 0, failed: 0 };
  let aborted = false;
  const accessCache = new Map<string, boolean>();
  for (const record of records) {
    if (ctx.remainingMs() < 30_000) {
      aborted = true;
      break;
    }
    if (mediaToCheck(record.states, ctx.now).length === 0) {
      summary.skippedNone += 1;
      continue;
    }
    let allowed = accessCache.get(record.userId);
    if (allowed === undefined) {
      allowed = accessAllows(await loadUserAccess(record.userId), "listings");
      accessCache.set(record.userId, allowed);
    }
    if (!allowed) {
      summary.skippedPlan += 1;
      continue;
    }
    try {
      const { lines } = await recheckListing(record.userId, record, { now: ctx.now, deadline: ctx.deadline - 15_000 });
      summary.checked += lines.length;
      for (const l of lines) {
        if (l.outcome.result === "missing") summary.missing += 1;
        else if (l.outcome.result === "mismatch") summary.mismatch += 1;
        else if (l.outcome.result === "error") summary.error += 1;
      }
    } catch (err) {
      summary.failed += 1;
      console.error("[listings-recheck] 失敗", record.userId, record.placeId, err instanceof Error ? err.message : err);
    }
  }
  return { summary, aborted };
}
