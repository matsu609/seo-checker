/**
 * GET /api/plan
 * ログイン中のユーザーの利用権限を返す。サイドバーの鍵表示とマスター画面・代理店画面のリンクに使う。
 * 返すのはプラン名・開放されている機能 ID・管理者かどうか・代理店かどうかだけで、決済情報は返さない。
 */
import { requireAuth } from "@/lib/auth/guard";
import { isAdmin, isAgency } from "@/lib/admin/guard";
import { getCurrentPlan } from "@/lib/plans/current";
import { featureOverrides } from "@/lib/plans/guard";

export const runtime = "nodejs";

export async function GET() {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  const [{ plan, source }, features, admin, agency] = await Promise.all([
    getCurrentPlan(),
    featureOverrides(),
    isAdmin(),
    isAgency(),
  ]);
  return Response.json(
    { plan, source, features, admin, agency },
    { headers: { "cache-control": "no-store" } },
  );
}
