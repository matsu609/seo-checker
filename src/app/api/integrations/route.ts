import { isAuthEnabled } from "@/lib/auth/config";
import { requireAuth } from "@/lib/auth/guard";
import { getGoogleConnection } from "@/lib/google/token";
import { getIntegrationStatus, getKeyExpiries } from "@/lib/integrations";

export const runtime = "nodejs";

/**
 * 外部連携の設定状況。
 * - `status`: 連携ごとの boolean。画面はこれを見て SetupNotice を出す
 * - `keyExpiry`: 寿命のあるキー（Ahrefs）の失効日と残り日数。**日付だけ**
 *
 * キーの値は絶対に返さない。互換のため boolean は従来どおり最上位にも置く
 * （古いクライアントが `data[key] === true` を読んでも動く）。
 */
export async function GET() {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  const status = getIntegrationStatus();
  // Google ビジネス プロフィールは OAuth（Clerk）なので、ログイン中の人の接続状態で判定する
  if (isAuthEnabled()) {
    try {
      const conn = await getGoogleConnection();
      status["google-business"] = conn.connected && conn.missingScopes.length === 0;
    } catch {
      status["google-business"] = false;
    }
  }
  return Response.json(
    { ...status, status, keyExpiry: getKeyExpiries() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
