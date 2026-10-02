/**
 * 無料診断の画面（/ と /meo）の入口。サーバー専用。
 *
 * 利用者の決定（2026-10-02）: 無料診断はお客様のアカウントでは使わない。別リンク（/free/login）で
 * 専用の ID / パスワードを入れた人（署名付き Cookie。src/lib/free/access.ts）だけが、回数制限なしで使う。
 * 2026-09-18 からの「登録後にメールアドレスごとに 2 回」と、運用者・管理アカウントの「デモ用 月 50 回」は廃止。
 *
 *   専用ログイン済み（Cookie あり）           → 画面を出す
 *   Clerk でログイン中（お客様・運用者・管理） → /start へ（契約状況で料金プラン / ツール / 顧客管理に振り分く）
 *   どちらでもない                            → ログイン画面（/sign-in）へ。無料診断の入口は営業・デモの人だけに渡す
 *
 * 認証も専用ログインも無い環境（開発・E2E）では素通り。
 */
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth/config";
import { SIGN_IN_PATH, START_PATH } from "@/lib/auth/landing";
import { hasFreeAccess } from "./access";

export async function gateFreePage(): Promise<void> {
  if (await hasFreeAccess()) return;
  if (isAuthEnabled()) {
    const { userId } = await auth();
    if (userId) redirect(START_PATH);
  }
  redirect(SIGN_IN_PATH);
}
