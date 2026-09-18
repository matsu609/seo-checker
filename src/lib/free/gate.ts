/**
 * 無料診断の画面（/ と /meo）の入口。サーバー専用。
 *
 * 利用者の決定（2026-09-18）: 無料診断はアカウント登録（担当者名・メール・会社名・電話・店舗の種類・パスワード）の
 * あとに、メールアドレスごとに 2 回まで。契約済みの人には見せない（2026-09-13 の決定のまま）。
 *
 *   未ログイン                → 登録フォームへ（ログイン済みの人はそこからログインへ）
 *   代理店                    → 代理店画面へ
 *   契約済み（free 以外）      → 最初のツールへ（運用者は確認のため入れる）
 *   登録情報が無い（Google でログインした人など） → 補完フォームへ
 *   それ以外                  → 画面を出す（残り回数つき）
 *
 * 認証が無効な環境（開発・E2E）では素通り（回数制限なし）。
 */
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { currentAgencyId, isAdmin } from "@/lib/admin/guard";
import { isAuthEnabled } from "@/lib/auth/config";
import { AGENCY_PATH, FIRST_TOOL_PATH, LEAD_PROFILE_PATH, SIGN_UP_PATH } from "@/lib/auth/landing";
import { getCurrentPlan } from "@/lib/plans/current";
import { leadFromMetadata } from "./lead";
import { getFreeQuota } from "./quota";
import type { FreeQuota } from "./quota-rules";

export interface FreeGate {
  /** 残り回数。認証が無効なら null（回数制限なし・表示もしない） */
  quota: FreeQuota | null;
}

export async function gateFreePage(path: "/" | "/meo"): Promise<FreeGate> {
  if (!isAuthEnabled()) return { quota: null };
  const { userId } = await auth();
  if (!userId) redirect(`${SIGN_UP_PATH}?redirect_url=${encodeURIComponent(path)}`);
  if (await currentAgencyId()) redirect(AGENCY_PATH);
  const admin = await isAdmin();
  if (!admin) {
    const { plan } = await getCurrentPlan();
    if (plan !== "free") redirect(FIRST_TOOL_PATH);
    const user = await currentUser();
    if (!leadFromMetadata(user?.publicMetadata, user?.unsafeMetadata)) {
      redirect(`${LEAD_PROFILE_PATH}?redirect_url=${encodeURIComponent(path)}`);
    }
  }
  return { quota: await getFreeQuota() };
}
