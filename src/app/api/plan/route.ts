/**
 * GET /api/plan
 * ログイン中のユーザーの利用権限を返す。サイドバーの鍵表示と、管理系タブのリンクに使う。
 * 返すのはプラン名・開放されている機能 ID・管理者かどうか・管理アカウントかどうかで、決済情報は返さない。
 *
 * 運用者のときだけ、**未対応のご意見の件数**（openFeedback）も付ける。サイドバーの通知バッジ用
 * （利用者の指示 2026-09-21）。ここに載せるのは、この応答が 1 ページにつき 1 回しか呼ばれないため。
 * Supabase が未設定・落ちているときは 0（バッジを出さない）。
 */
import { requireAuth } from "@/lib/auth/guard";
import { isAdmin, isAgency } from "@/lib/admin/guard";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { countOpenFeedback } from "@/lib/feedback/store";
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
  // 未対応のご意見（運用者だけ。読めなければ 0 にして画面は止めない）
  let openFeedback = 0;
  if (admin && isSupabaseConfigured()) {
    try {
      openFeedback = await countOpenFeedback();
    } catch {
      openFeedback = 0;
    }
  }

  return Response.json(
    { plan, source, features, admin, agency, openFeedback },
    { headers: { "cache-control": "no-store" } },
  );
}
