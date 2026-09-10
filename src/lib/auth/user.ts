/**
 * 保存系の機能で「誰の行か」を決めるユーザー ID。サーバー専用。
 *
 * Clerk が有効ならそのユーザー ID（`user_...`）。無効な環境（開発・E2E）では
 * 認証ガードが素通りするのに合わせて固定値 "local" を返し、機能を動かせるようにする。
 * requireAuth() を通ったあとに呼ぶこと（未ログインなら null）。
 */
import { auth } from "@clerk/nextjs/server";
import { isAuthEnabled } from "./config";

export const LOCAL_USER_ID = "local";

export async function currentUserId(): Promise<string | null> {
  if (!isAuthEnabled()) return LOCAL_USER_ID;
  const { userId } = await auth();
  return userId ?? null;
}
