/**
 * GET /api/seo-analysis — 履歴（新しい順）と今月の残り回数、連携の有無。
 */
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { quotaFor } from "@/lib/seo-analysis/quota";
import { listRuns } from "@/lib/seo-analysis/runs";
import { requireUser } from "@/lib/auth/guard";

export const runtime = "nodejs";

export async function GET() {
  const userId = await requireUser({ feature: "seo-analysis" });
  if (userId instanceof Response) return userId;

  const enabled = isSupabaseConfigured() && isAnthropicEnabled();
  if (!enabled) {
    return Response.json(
      { enabled: false, runs: [], quota: null },
      { headers: { "cache-control": "no-store" } },
    );
  }
  try {
    const [runs, quota] = await Promise.all([listRuns(userId), quotaFor(userId)]);
    return Response.json({ enabled: true, runs, quota }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
