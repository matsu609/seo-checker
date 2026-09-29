/**
 * GET /api/usage — ログイン中の本人の、今月の利用回数と上限（設定画面の「今月の利用回数」）。
 *
 * 返すのは回数だけ（金額は出さない。単価は運用者の情報）。精密診断は従来の仕組み（analysis_runs）から。
 * Supabase が未設定・テーブルが無いときは `available: false` で、画面は「まだ数えていない」と出す。
 * 並べるのは**その人が使える機能だけ**（プラン・個別開放・運用者。plans/access.ts と同じ判定。2026-09-23）。
 */
import { requireUser } from "@/lib/auth/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { findFeatureById } from "@/lib/features/registry";
import { featureAllowed } from "@/lib/plans/access";
import { currentAccessSubject } from "@/lib/plans/guard";
import { quotaFor } from "@/lib/seo-analysis/quota";
import { jstMonthKey } from "@/lib/time/jst";
import { usageStatus } from "@/lib/usage/gate";
import { USAGE_LIMITS, usableUsageFeatures, usageResetsOn, type UsageFeature } from "@/lib/usage/limits";

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
    const [status, quota, subject] = await Promise.all([usageStatus(userId, now), quotaFor(userId), currentAccessSubject()]);
    const canUse = (featureId: string) => featureAllowed(subject, findFeatureById(featureId));
    const items: UsageItem[] = [
      ...(canUse("seo-analysis")
        ? [
            {
              key: "seo-analysis" as const,
              label: "精密診断",
              unit: "回",
              counts: "診断 1 回（毎月の自動再診断も含む）",
              used: quota.used,
              limit: quota.unlimited ? null : quota.limit,
            },
          ]
        : []),
      ...usableUsageFeatures(canUse).map((key) => ({
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
