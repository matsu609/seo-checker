/**
 * POST /api/reports/generate { month? } … 月次レポートをいま作る（前月か今月の途中まで）。
 * 毎月 1 日の自動作成と同じ中身。メールは送らない（画面に出るため）。
 */
import { z } from "zod";
import { NO_STORE } from "@/lib/api/headers";
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { generateReportFor } from "@/lib/reports/job";
import { isMonthKey, jstMonthKey, previousMonthKey } from "@/lib/time/jst";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({ month: z.string().optional() });

export async function POST(request: Request) {
  const userId = await requireUser({ feature: "reports" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "月次レポートには Supabase の設定が必要です", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  const now = new Date();
  const current = jstMonthKey(now);
  const month = parsed.data.month ?? previousMonthKey(current);
  if (!isMonthKey(month) || (month !== current && month !== previousMonthKey(current))) {
    return Response.json({ error: "作れるのは前月分と今月分（途中まで）です" }, { status: 400, headers: NO_STORE });
  }
  try {
    const report = await generateReportFor(userId, month, { now, notify: false });
    return Response.json({ report }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
