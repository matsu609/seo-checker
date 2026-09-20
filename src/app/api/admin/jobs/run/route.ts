/**
 * POST /api/admin/jobs/run { job } … 1 本のジョブを予定日に関係なく今すぐ動かす。運用者だけ。
 *
 * 本番で「ちゃんと動くか」を確かめるためのもの。実費の出る処理（SerpApi・Places・クロール）も
 * そのまま動くので、押す前に対象の件数を確かめること。
 */
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { jobDefinitions } from "@/lib/jobs/registry";
import { runJobs } from "@/lib/jobs/runner";
import { JOB_IDS } from "@/lib/jobs/types";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";
export const maxDuration = 300;

const BUDGET_MS = 250_000;
const BodySchema = z.object({ job: z.enum(JOB_IDS) });

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase が未設定です" }, { status: 503, headers: NO_STORE });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "ジョブの指定が正しくありません" }, { status: 400, headers: NO_STORE });
  const outcomes = await runJobs(jobDefinitions(), { budgetMs: BUDGET_MS, only: [parsed.data.job], force: true, signal: request.signal });
  return Response.json({ outcomes }, { headers: NO_STORE });
}
