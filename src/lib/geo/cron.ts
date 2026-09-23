/**
 * AI 検索モニタリングの日次バッチを、アカウントの数だけ回す（/api/cron/geo-run の中身）。
 * 依存は引数で受け取るので、テストからはダミーを渡して動かせる。
 *
 * 2026-09-23 に直したこと:
 *   - **プランを確かめる**。以前は geo_accounts に行がある全員を回しており、解約・プラン変更で
 *     AI 検索モニタリングを使えなくなった人の分まで DataForSEO の実費が出ていた
 *     （順位計測・サイト監視などほかの定期処理は元から確かめている）
 *   - **前回たどり着けなかったアカウントから始める**。以前は毎回登録の古い順で、
 *     時間切れで切られる後ろのアカウントは毎日切られ続けていた
 */
import { accessAllows, type UserAccess } from "@/lib/plans/user";
import { RESUME_KEY, startFromCursor } from "@/lib/jobs/cursor";
import type { RunSummary } from "./run";

export interface GeoCronDeps {
  listAccounts: () => Promise<{ userId: string }[]>;
  access: (userId: string) => Promise<UserAccess>;
  runDaily: (userId: string, options: { budgetMs: number; signal?: AbortSignal }) => Promise<RunSummary>;
  /** 前回どこまで回れたか（次に始めるアカウントの ID。無ければ先頭から） */
  cursor: () => Promise<string | null>;
}

export interface GeoCronOptions {
  /** 全体に使ってよい時間 */
  budgetMs: number;
  /** 1 アカウントに使ってよい時間 */
  perAccountMs: number;
  signal?: AbortSignal;
}

export interface GeoCronResult {
  accounts: number;
  processed: number;
  executed: number;
  cacheHits: number;
  failed: number;
  creditsUsed: number;
  skippedPlan: number;
  aborted: boolean;
  /** 時間切れで回れなかった最初のアカウント（次回はここから）。最後まで回れたら null */
  nextStart: string | null;
}

export async function runGeoAccounts(deps: GeoCronDeps, options: GeoCronOptions): Promise<GeoCronResult> {
  const started = Date.now();
  const accounts = startFromCursor(await deps.listAccounts(), (a) => a.userId, await deps.cursor().catch(() => null));
  const result: GeoCronResult = { accounts: accounts.length, processed: 0, executed: 0, cacheHits: 0, failed: 0, creditsUsed: 0, skippedPlan: 0, aborted: false, nextStart: null };

  for (const account of accounts) {
    if (Date.now() - started > options.budgetMs || options.signal?.aborted) {
      result.aborted = true;
      result.nextStart = account.userId;
      break;
    }
    try {
      // 契約の無い人（プランで AI 検索モニタリングが使えない人）のために実費の出る計測を走らせない
      if (!accessAllows(await deps.access(account.userId), "geo")) {
        result.skippedPlan += 1;
        continue;
      }
      const summary = await deps.runDaily(account.userId, { budgetMs: options.perAccountMs, signal: options.signal });
      result.processed += 1;
      result.executed += summary.executed;
      result.cacheHits += summary.cacheHits;
      result.failed += summary.failed;
      result.creditsUsed += summary.creditsUsed;
    } catch (err) {
      console.error("[geo-run] failed", account.userId, err instanceof Error ? err.message : err);
      result.processed += 1;
      result.failed += 1;
    }
  }

  result.creditsUsed = Math.round(result.creditsUsed * 100) / 100;
  return result;
}

/** 実行記録（cron_runs）に残す summary。次回の始まり（nextStart）もここに入れる */
export function geoCronSummary(result: GeoCronResult): Record<string, unknown> {
  const { nextStart, ...rest } = result;
  return nextStart ? { ...rest, [RESUME_KEY]: nextStart } : rest;
}
