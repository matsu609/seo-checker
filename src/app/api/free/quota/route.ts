/**
 * GET /api/free/quota … 今月の無料診断の回数（画面が診断のあとに取り直す）。専用リンクの Cookie が要る。
 */
import { NO_STORE } from "@/lib/api/headers";
import { requireFreeAccess } from "@/lib/free/access";
import { freeRunsThisMonth } from "@/lib/free/monthly";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireFreeAccess();
  if (denied) return denied;
  return Response.json(await freeRunsThisMonth(), { headers: NO_STORE });
}
