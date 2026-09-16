/**
 * GET /api/cron/geo-run
 * AI 検索モニタリングの日次バッチ。Vercel の Cron（vercel.json: 毎日 5:00 JST）が叩く。
 *
 * 反復は週内の別の日に分散してあるので（仕様書 §2.3）、**毎日走らせて当日分だけ**を実行する。
 * 顧客ごとの曜日オフセット（§2.4）は planToday が見る。
 *
 * ログインではなく CRON_SECRET で守る（maps-refresh と同じ）。
 * 未設定なら一切動かさない（誰でも叩けて DataForSEO の費用が出る状態にしない）。
 */
import { isCronAuthorized, isCronConfigured } from "@/lib/auth/cron";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { isDataForSeoConfigured } from "@/lib/geo/dataforseo";
import { runDailyForUser } from "@/lib/geo/service";
import { listAccounts } from "@/lib/geo/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/** maxDuration より短く切り上げる（保存の途中で切られないように） */
const BUDGET_MS = 240_000;
/** 1 アカウントに使ってよい時間。多くの顧客を 1 回の Cron で回すため */
const PER_ACCOUNT_MS = 40_000;

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return Response.json({ error: "CRON_SECRET が未設定のため日次計測は無効です" }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase が未設定のため日次計測は無効です" }, { status: 503 });
  }
  if (!isDataForSeoConfigured()) {
    return Response.json({ error: "DataForSEO が未設定のため日次計測は無効です" }, { status: 503 });
  }

  const started = Date.now();
  const accounts = await listAccounts();
  const results: { userId: string; planned: number; executed: number; cacheHits: number; failed: number; creditsUsed: number }[] = [];
  let aborted = false;

  for (const account of accounts) {
    if (Date.now() - started > BUDGET_MS) {
      aborted = true;
      break;
    }
    try {
      const summary = await runDailyForUser(account.userId, { budgetMs: PER_ACCOUNT_MS, signal: request.signal });
      results.push({
        userId: account.userId,
        planned: summary.planned,
        executed: summary.executed,
        cacheHits: summary.cacheHits,
        failed: summary.failed,
        creditsUsed: summary.creditsUsed,
      });
    } catch (err) {
      console.error("[geo-run] failed", account.userId, err);
      results.push({ userId: account.userId, planned: 0, executed: 0, cacheHits: 0, failed: 1, creditsUsed: 0 });
    }
  }

  const summary = {
    accounts: accounts.length,
    processed: results.length,
    executed: results.reduce((a, r) => a + r.executed, 0),
    cacheHits: results.reduce((a, r) => a + r.cacheHits, 0),
    failed: results.reduce((a, r) => a + r.failed, 0),
    creditsUsed: Math.round(results.reduce((a, r) => a + r.creditsUsed, 0) * 100) / 100,
    aborted,
  };
  console.info("[geo-run]", summary);
  return Response.json(summary, { status: aborted ? 502 : 200, headers: { "cache-control": "no-store" } });
}
