/**
 * 月の回数制限（サーバー専用）。運営者（ADMIN_EMAILS）は無制限。
 */
import { isAdmin } from "@/lib/admin/guard";
import { countThisMonth, monthlyLimit } from "./runs";

export interface Quota {
  used: number;
  limit: number;
  unlimited: boolean;
}

export async function quotaFor(userId: string): Promise<Quota> {
  const unlimited = await isAdmin();
  const used = await countThisMonth(userId);
  return { used, limit: monthlyLimit(), unlimited };
}

export function quotaExceeded(q: Quota): boolean {
  return !q.unlimited && q.used >= q.limit;
}
