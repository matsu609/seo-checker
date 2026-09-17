/**
 * POST /api/analytics — アクセス解析の報告書と、貼り付け用の計測タグを返す。
 *
 * 本文: { days: 7 | 28 | 90 }。対象期間は「今日（JST）まで days 日」、比較はその直前の同じ長さ。
 * サイト行（公開 ID）が無ければここで作る（画面を開いた時点でタグを発行できるように）。
 * 開くたびに、保持期間より古い生ログをそのサイトの分だけ消す（Cron を増やさない）。
 */
import { z } from "zod";
import { buildReport, shiftDay, trackingSnippet, type AnalyticsPayload } from "@/lib/analytics";
import { deleteOlderThan, ensureSite, lastEventAt, listEvents, RETENTION_DAYS } from "@/lib/analytics/store";
import { jstDay } from "@/lib/analytics/visitor";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({ days: z.union([z.literal(7), z.literal(28), z.literal(90)]).default(28) });

export async function POST(request: Request) {
  const denied = await requireAuth({ feature: "analytics" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "アクセス解析には SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY の設定が必要です", code: "not_configured" }, { status: 503 });
  }

  let raw: unknown = {};
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const parsed = BodySchema.safeParse(raw ?? {});
  if (!parsed.success) return Response.json({ error: "期間は 7 / 28 / 90 日のいずれかです" }, { status: 422 });
  const days = parsed.data.days;

  const to = jstDay();
  const from = shiftDay(to, -(days - 1));
  const previousTo = shiftDay(from, -1);
  const previousFrom = shiftDay(previousTo, -(days - 1));

  try {
    const site = await ensureSite(userId);
    const [rows, previousRows, last] = await Promise.all([listEvents(site.key, from, to), listEvents(site.key, previousFrom, previousTo), lastEventAt(site.key)]);
    // 古い生ログの掃除（失敗しても報告書は出す）
    deleteOlderThan(site.key, shiftDay(to, -RETENTION_DAYS)).catch(() => undefined);
    const payload: AnalyticsPayload = {
      site: { key: site.key, snippet: trackingSnippet(site.key), lastEventAt: last },
      report: buildReport({ rows, previousRows, from, to }),
    };
    return Response.json(payload, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
