/**
 * API ルートハンドラ用の認証ガード。
 *
 * proxy.ts でも保護しているが、Next.js のドキュメントが
 * 「マッチャの変更やルートの移動で Proxy のカバーが静かに外れることがあるため、
 * 認証・認可はハンドラ内でも必ず検証すること」と明記している。
 * 実費の出る API はここでも 401 を返す。
 *
 * Clerk 未設定の環境（開発・E2E）では素通りさせる。
 */
import { auth } from "@clerk/nextjs/server";
import { requirePlanForFeature } from "@/lib/plans/guard";
import { isAuthEnabled, warnIfAuthDisabled } from "./config";
import { unauthorizedResponse } from "./routes";

export interface RequireAuthOptions {
  /**
   * 機能 ID（src/lib/features/registry.ts）。渡すと、ログイン確認のあとに
   * その機能に必要な料金プランも確認し、足りなければ 402 を返す。
   * プラン名をここに書き写さないのは、レジストリと必ずずれるため。
   */
  feature?: string;
}

/**
 * 未ログインなら 401、プランが足りなければ 402 の Response を返す。
 * どちらも問題なければ（または認証が無効なら）null。
 *
 * 使い方:
 * ```ts
 * const denied = await requireAuth({ feature: "site-audit" });
 * if (denied) return denied;
 * ```
 */
export async function requireAuth(options: RequireAuthOptions = {}): Promise<Response | null> {
  if (!isAuthEnabled()) {
    warnIfAuthDisabled();
    return null;
  }
  const { userId } = await auth();
  if (!userId) return unauthorizedResponse();
  if (options.feature) return requirePlanForFeature(options.feature);
  return null;
}
