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
import { isAuthEnabled, warnIfAuthDisabled } from "./config";
import { unauthorizedResponse } from "./routes";

/**
 * 未ログインなら 401 の Response を返す。ログイン済み（または認証無効）なら null。
 *
 * 使い方:
 * ```ts
 * const denied = await requireAuth();
 * if (denied) return denied;
 * ```
 */
export async function requireAuth(): Promise<Response | null> {
  if (!isAuthEnabled()) {
    warnIfAuthDisabled();
    return null;
  }
  const { userId } = await auth();
  if (userId) return null;
  return unauthorizedResponse();
}
