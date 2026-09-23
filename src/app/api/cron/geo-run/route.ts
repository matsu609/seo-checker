/**
 * GET /api/cron/geo-run
 * AI 検索モニタリングの日次バッチ。Vercel の Cron（vercel.json: 毎日 5:00 JST）が叩く。
 *
 * 反復は週内の別の日に分散してあるので（仕様書 §2.3）、**毎日走らせて当日分だけ**を実行する。
 * 顧客ごとの曜日オフセット（§2.4）は planToday が見る。
 * 回し方（プランの確認・前回の続きから始める）は src/lib/geo/cron.ts。
 *
 * ログインではなく CRON_SECRET で守る（maps-refresh と同じ）。
 * 未設定なら一切動かさない（誰でも叩けて DataForSEO の費用が出る状態にしない）。
 */
import { isCronAuthorized, isCronConfigured } from "@/lib/auth/cron";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { geoCronSummary, runGeoAccounts } from "@/lib/geo/cron";
import { isDataForSeoConfigured } from "@/lib/geo/dataforseo";
import { runDailyForUser } from "@/lib/geo/service";
import { listAccounts } from "@/lib/geo/store";
import { finishRun, lastResumeCursor, startRun } from "@/lib/jobs/runs";
import { loadUserAccess } from "@/lib/plans/user";

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

  // 実行記録（cron_runs）に残す。前回どこまで回れたかを次回に渡すため（2026-09-23）
  const runId = await startRun("geo-run");
  try {
    const result = await runGeoAccounts(
      {
        listAccounts,
        access: loadUserAccess,
        runDaily: (userId, options) => runDailyForUser(userId, options),
        cursor: () => lastResumeCursor("geo-run"),
      },
      { budgetMs: BUDGET_MS, perAccountMs: PER_ACCOUNT_MS, signal: request.signal },
    );
    const summary = geoCronSummary(result);
    await finishRun(runId, result.aborted ? "aborted" : "ok", summary);
    console.info("[geo-run]", summary);
    return Response.json(summary, { status: result.aborted ? 502 : 200, headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await finishRun(runId, "failed", { error: message });
    console.error("[geo-run] failed", message);
    return Response.json({ error: "日次計測に失敗しました" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
