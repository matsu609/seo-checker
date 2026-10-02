/**
 * POST /api/free/logout … 無料診断の専用ログインを終える（Cookie を消す）。
 */
import { NO_STORE } from "@/lib/api/headers";
import { clearFreeSession } from "@/lib/free/access";

export const runtime = "nodejs";

export async function POST() {
  await clearFreeSession();
  return Response.json({ ok: true }, { headers: NO_STORE });
}
