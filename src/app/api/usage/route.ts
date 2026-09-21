/**
 * GET /api/usage — ログイン中の本人の、今月の利用回数と上限（設定画面の「今月の利用回数」）。
 *
 * 返すのは回数だけ（金額は出さない。単価は運用者の情報）。精密診断は従来の仕組み（analysis_runs）から。
 * Supabase が未設定・テーブルが無いときは `available: false` で、画面は「まだ数えていない」と出す。
 */
import { requireUser } from "@/lib/auth/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { quotaFor } from "@/lib/seo-analysis/quota";
import { jstMonthKey } from "@/lib/time/jst";
import { usageStatus } from "@/lib/usage/gate";
import { USAGE_FEATURES, USAGE_LIMITS, usageResetsOn, type UsageFeature } from "@/lib/usage/limits";

export const runtime = "nodejs";

export interface UsageItem {
  key: UsageFeature | "seo-analysis";
  label: string;
  unit: string;
  counts: string;
  used: number;
  /** null = 無制限 */
  limit: number | null;
}

export interface UsageResponse {
  available: boolean;
  month: string;
  resetsOn: string;
  staff: boolean;
  items: UsageItem[];
}

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  const now = new Date();
  const base = { month: jstMonthKey(now), resetsOn: usageResetsOn(now) };
  if (!isSupabaseConfigured()) {
    const body: UsageResponse = { available: false, ...base, staff: false, items: [] };
    return Response.json(body, { headers: NO_STORE });
  }
  try {
    const [status, quota] = await Promise.all([usageStatus(userId, now), quotaFor(userId)]);
    const items: UsageItem[] = [
      {
        key: "seo-analysis",
        label: "精密診断",
        unit: "回",
        counts: "診断 1 回（毎月の自動再診断も含む）",
        used: quota.used,
        limit: quota.unlimited ? null : quota.limit,
      },
      ...USAGE_FEATURES.map((key) => ({
        key,
        label: USAGE_LIMITS[key].label,
        unit: USAGE_LIMITS[key].unit,
        counts: USAGE_LIMITS[key].counts,
        used: status.used[key],
        limit: status.limits[key],
      })),
    ];
    const body: UsageResponse = { available: true, ...base, staff: status.staff, items };
    return Response.json(body, { headers: NO_STORE });
  } catch {
    const body: UsageResponse = { available: false, ...base, staff: false, items: [] };
    return Response.json(body, { headers: NO_STORE });
  }
}
