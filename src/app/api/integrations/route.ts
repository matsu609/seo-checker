import { requireAuth } from "@/lib/auth/guard";
import { getIntegrationStatus } from "@/lib/integrations";

export const runtime = "nodejs";

/**
 * 外部連携の設定状況（boolean のみ）。
 * 画面はこれを見て SetupNotice を出したり、未設定の列を「未設定」にする。
 */
export async function GET() {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json(getIntegrationStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
