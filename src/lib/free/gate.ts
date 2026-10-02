/**
 * 無料診断の画面（/ と /meo）の入口。サーバー専用。
 *
 * 利用者の決定（2026-10-02）: 無料診断はお客様のアカウントでは使わない。パスワードも無い。
 * 専用リンク（`/free/<トークン>`。マスター画面に表示）を開いた人の署名付き Cookie（src/lib/free/access.ts）だけで通し、
 * 月の回数上限（monthly.ts）で止める。登録後の「2 回まで」と運用者の「デモ用 月 50 回」は廃止。
 *
 *   専用リンクを開いた人（Cookie あり）          → 画面を出す（今月の回数つき）
 *   Clerk でログイン中（お客様・運用者・管理）    → /start へ（契約状況で料金プラン / ツール / 顧客管理に振り分く）
 *   どちらでもない                               → ログイン画面（/sign-in）へ
 *
 * 認証も専用リンクも無い環境（開発・E2E）では素通り。
 */
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { isAuthEnabled } from "@/lib/auth/config";
import { SIGN_IN_PATH, START_PATH } from "@/lib/auth/landing";
import { hasFreeAccess } from "./access";
import { freeRunsThisMonth } from "./monthly";
import type { FreeRuns } from "./monthly-rules";

export interface FreeGate {
  /** 今月の診断回数（画面の上に出す） */
  runs: FreeRuns;
}

export async function gateFreePage(): Promise<FreeGate> {
  if (!(await hasFreeAccess())) {
    if (isAuthEnabled()) {
      const { userId } = await auth();
      if (userId) redirect(START_PATH);
    }
    redirect(SIGN_IN_PATH);
  }
  return { runs: await freeRunsThisMonth() };
}
