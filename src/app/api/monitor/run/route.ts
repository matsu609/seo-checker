/**
 * POST /api/monitor/run … いますぐ確認する（毎週水曜の自動確認と同じ中身）。ログイン必須。
 * 自社サイトに数十リクエストを出すので、同じ利用者は 5 分に 1 回まで。
 */
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { globalCache } from "@/lib/cache";
import { monitorUserSite } from "@/lib/monitor/job";
import { loadSharedSettings } from "@/lib/settings/server";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";
export const maxDuration = 120;

const COOLDOWN_MS = 5 * 60 * 1000;
const recent = globalCache<number>("monitorRun", COOLDOWN_MS, 500);

export async function POST(request: Request) {
  const userId = await requireUser({ feature: "monitor" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "サイト監視には Supabase の設定が必要です", code: "not_configured" }, { status: 503, headers: NO_STORE });
  if (recent.get(userId)) return Response.json({ error: "確認は 5 分に 1 回までです。しばらく待ってからもう一度お試しください" }, { status: 429, headers: NO_STORE });
  try {
    const settings = await loadSharedSettings(userId);
    const project = settings.project;
    const siteUrl = project?.startUrl || (project?.domain ? `https://${project.domain}/` : null);
    if (!siteUrl) return Response.json({ error: "設定でホームページの URL を登録してください" }, { status: 400, headers: NO_STORE });
    recent.set(userId, Date.now());
    const { snapshot, diff } = await monitorUserSite(userId, siteUrl, { deadline: Date.now() + 100_000, signal: request.signal, notify: false });
    return Response.json({ latest: snapshot, diff }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
