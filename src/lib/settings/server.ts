/**
 * 設定に集約した基本情報をサーバーで読む（AI 検索モニタリングの同期・Cron 用）。サーバー専用。
 *
 * ブラウザ側ストアの写し（user_stores）と Clerk の登録情報（lead）から組み立てる。
 * Clerk が無い開発環境では lead は null。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { listUserStores } from "@/lib/db/user-stores";
import { leadFromMetadata, type LeadProfile } from "@/lib/free/lead";
import { sharedSettingsFromStores, type SharedSettings } from "./shared";

async function loadLead(userId: string): Promise<LeadProfile | null> {
  if (!isAuthEnabled()) return null;
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return leadFromMetadata(user.publicMetadata, user.unsafeMetadata ?? null);
  } catch {
    return null;
  }
}

export async function loadSharedSettings(userId: string): Promise<SharedSettings> {
  const [stores, lead] = await Promise.all([listUserStores(userId), loadLead(userId)]);
  return sharedSettingsFromStores(stores, lead);
}
