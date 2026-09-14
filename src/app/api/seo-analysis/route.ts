/**
 * GET /api/seo-analysis — 履歴（新しい順）と今月の残り回数、連携の有無。
 */
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { isSecondOpinionEnabled } from "@/lib/seo-analysis/ai/second-opinion";
import { quotaFor } from "@/lib/seo-analysis/quota";
import { listRuns } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAuth({ feature: "seo-analysis" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });

  const enabled = isSupabaseConfigured() && isAnthropicEnabled();
  if (!enabled) {
    return Response.json(
      { enabled: false, runs: [], quota: null, secondOpinion: isSecondOpinionEnabled() },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const [runs, quota] = await Promise.all([listRuns(userId), quotaFor(userId)]);
    return Response.json({ enabled: true, runs, quota, secondOpinion: isSecondOpinionEnabled() }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
