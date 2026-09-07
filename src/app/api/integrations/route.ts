import { getIntegrationStatus } from "@/lib/integrations";

export const runtime = "nodejs";

/**
 * 外部連携の設定状況（boolean のみ）。
 * 画面はこれを見て SetupNotice を出したり、未設定の列を「未設定」にする。
 */
export async function GET() {
  return Response.json(getIntegrationStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
