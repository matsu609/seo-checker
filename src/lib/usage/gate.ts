/**
 * 実費の出る API ルートの月の回数上限（サーバー専用）。
 *
 * 使い方（本文の検証とキャッシュの確認が済んで、**外部 API を呼ぶ直前**に）:
 * ```ts
 * const over = await takeUsage("writing");
 * if (over) return over;   // 429（今月の上限に達した）
 * ```
 *
 * 判定の順序: 認証が無効（開発・E2E）→ 数えない / 運用者 → 数えるが止めない / Supabase 未設定 → 数えない /
 * 上限内 → 1 行記録して通す / 上限 → 429 で止める（記録しない）。
 *
 * **記録や読み出しに失敗したときは通す（fail open）。**テーブルがまだ無い・DB が落ちている、で
 * お客様の作業を止めるより、その月だけ上限が効かない方を選ぶ（console.warn で残す。
 * マスター画面の「外部連携」で Supabase が設定済みなのに /api/usage がエラーを返すなら SQL の実行漏れ）。
 * 同時に 2 回押されたときの取りこぼし（1〜2 回の超過）は許容する。
 */
import { isAdmin } from "@/lib/admin/guard";
import { isAuthEnabled } from "@/lib/auth/config";
import { currentUserId } from "@/lib/auth/user";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { getCurrentPlan } from "@/lib/plans/current";
import { USAGE_LIMITS, usageLimitFor, usageLimitMessage, usageResetsOn, type UsageFeature } from "./limits";
import { recordUsage, sumUsageThisMonth } from "./store";

export interface UsageDecision {
  allowed: boolean;
  used: number;
  /** null = 無制限 */
  limit: number | null;
  resetsOn: string;
}

/** 判定だけ（記録しない）。/api/usage と takeUsage が使う */
export async function usageStatus(userId: string, now = new Date()): Promise<{ used: Record<UsageFeature, number>; limits: Record<UsageFeature, number | null>; staff: boolean }> {
  const [{ plan }, staff] = await Promise.all([getCurrentPlan(), isAdmin()]);
  const used = await sumUsageThisMonth(userId, now);
  const limits = Object.fromEntries(Object.keys(USAGE_LIMITS).map((k) => [k, usageLimitFor(k as UsageFeature, plan, staff)])) as Record<UsageFeature, number | null>;
  return { used, limits, staff };
}

let warned = false;
function warnOnce(err: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[usage] 利用回数の記録に失敗しました（上限は効いていません。usage_events テーブルの SQL を確認）", err instanceof Error ? err.message : err);
}

/**
 * 上限内なら記録して null、上限に達していれば 429 の Response。
 * `amount` は実費の出る回数（順位計測なら実際に SerpApi を呼ぶ語数）。0 以下なら何もしない。
 */
export async function takeUsage(feature: UsageFeature, amount = 1, meta?: Record<string, unknown>): Promise<Response | null> {
  if (amount <= 0) return null;
  if (!isAuthEnabled()) return null;
  const userId = await currentUserId();
  if (!userId) return null;
  if (!isSupabaseConfigured()) return null;

  const meta_ = USAGE_LIMITS[feature];
  let status: Awaited<ReturnType<typeof usageStatus>>;
  try {
    status = await usageStatus(userId);
  } catch (err) {
    warnOnce(err);
    return null;
  }
  const limit = status.limits[feature];
  const used = status.used[feature];
  if (limit !== null && used + amount > limit) {
    const resetsOn = usageResetsOn();
    return Response.json(
      { error: usageLimitMessage(meta_, used, limit, resetsOn), code: "usage_limit", feature, used, limit, resetsOn },
      { status: 429, headers: { "cache-control": "no-store" } },
    );
  }
  try {
    await recordUsage(userId, feature, amount, meta);
  } catch (err) {
    warnOnce(err);
  }
  return null;
}
