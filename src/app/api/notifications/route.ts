/**
 * GET /api/notifications … ログイン中の利用者へのお知らせ（新しい順 50 件）と未読数。
 */
import { requireUser } from "@/lib/auth/guard";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { isMailConfigured } from "@/lib/mail/send";
import { listNotifications } from "@/lib/notifications/store";
import type { Notification } from "@/lib/notifications/types";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";

export interface NotificationsResponse {
  enabled: boolean;
  /** メール送信が設定されているか（設定画面の案内に使う） */
  mailConfigured: boolean;
  items: Notification[];
  unread: number;
}

export async function GET() {
  const userId = await requireUser();
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) {
    const body: NotificationsResponse = { enabled: false, mailConfigured: isMailConfigured(), items: [], unread: 0 };
    return Response.json(body, { headers: NO_STORE });
  }
  try {
    const items = await listNotifications(userId);
    const body: NotificationsResponse = { enabled: true, mailConfigured: isMailConfigured(), items, unread: items.filter((n) => n.readAt === null).length };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
