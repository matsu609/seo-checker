/**
 * GET /api/cron/daily
 * 日次の定期処理。Vercel の Cron（vercel.json: 毎日 5:00 JST）が叩く。
 *
 * Vercel の Hobby プランは Cron が 2 本まで・1 日 1 回なので、曜日・日付で振り分ける
 * ジョブをすべてここに載せる（振り分けは src/lib/jobs/schedule.ts）。
 *   ?job=<id> を付けると、その 1 本だけを予定日に関係なく動かす（手動確認用）。
 *
 * ログインではなく CRON_SECRET で守る（Vercel は Cron の呼び出しに
 * `Authorization: Bearer <CRON_SECRET>` を自動で付ける）。未設定なら一切動かさない。
 * src/lib/auth/routes.ts で公開 API に入れてあるので、Clerk の 401 は返らない。
 */
import { isCronAuthorized, isCronConfigured } from "@/lib/auth/cron";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { jobDefinitions } from "@/lib/jobs/registry";
import { runJobs } from "@/lib/jobs/runner";
import { JOB_IDS, type JobId } from "@/lib/jobs/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** maxDuration より短く切り上げる（保存の途中で切られないように） */
const BUDGET_MS = 250_000;

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return Response.json({ error: "CRON_SECRET が未設定のため定期処理は無効です" }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase が未設定のため定期処理は無効です" }, { status: 503 });
  }

  const only = new URL(request.url).searchParams.get("job");
  if (only !== null && !(JOB_IDS as readonly string[]).includes(only)) {
    return Response.json({ error: `知らないジョブです: ${only}` }, { status: 400 });
  }

  const outcomes = await runJobs(jobDefinitions(), {
    budgetMs: BUDGET_MS,
    signal: request.signal,
    ...(only ? { only: [only as JobId], force: true } : {}),
  });
  const failed = outcomes.filter((o) => o.status === "failed").length;
  const aborted = outcomes.some((o) => o.status === "aborted");
  console.info("[cron/daily]", outcomes);
  return Response.json({ outcomes, failed, aborted }, { status: failed > 0 || aborted ? 502 : 200, headers: { "cache-control": "no-store" } });
}
