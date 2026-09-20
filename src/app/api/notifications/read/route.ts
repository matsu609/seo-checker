/**
 * POST /api/notifications/read … 未読のお知らせをすべて既読にする。
 */
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { markAllRead } from "@/lib/notifications/store";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";

export async function POST() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return new Response(null, { status: 204, headers: NO_STORE });
  try {
    await markAllRead(userId);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
