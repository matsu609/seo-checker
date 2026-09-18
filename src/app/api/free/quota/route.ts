/**
 * GET /api/free/quota … いまのユーザーの無料診断の残り回数（画面が診断のあとに取り直す）。
 * 未ログインは 401。認証が無効な環境では「回数制限なし」。
 */
import { getFreeQuota } from "@/lib/free/quota";

export const runtime = "nodejs";

export async function GET() {
  const quota = await getFreeQuota();
  if (!quota) return Response.json({ error: "ログインが必要です", code: "sign_in" }, { status: 401, headers: { "cache-control": "no-store" } });
  return Response.json(quota, { headers: { "cache-control": "no-store" } });
}
