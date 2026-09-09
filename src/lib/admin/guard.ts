/**
 * マスター画面のアクセス制御。サーバー専用。
 *
 * 判定は「ログイン中 かつ 確認済みのメールが ADMIN_EMAILS に含まれる」。
 * 未確認のメールを許すと、管理者のアドレスで登録するだけで入れてしまうので、
 * verified なものだけを見る。
 *
 * 認証が無効な環境（開発・E2E）でも、ここは開けない。全顧客の請求情報が
 * 出る画面なので、鍵が無いときは通さないほうを既定にする。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { adminEmails, isAdminEmail } from "./config";

export async function isAdmin(): Promise<boolean> {
  if (!isAuthEnabled()) return false;
  const allowed = adminEmails();
  if (allowed.length === 0) return false;

  const { userId } = await auth();
  if (!userId) return false;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.emailAddresses.some(
      (e) => e.verification?.status === "verified" && isAdminEmail(e.emailAddress, allowed),
    );
  } catch {
    // 取れなければ管理者でない扱い（開ける方向には倒さない）
    return false;
  }
}

/** API ルート用。管理者でなければ 404 の Response を返す */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  // 403 だと「その画面が存在すること」を教えてしまうので 404 にする
  return Response.json(
    { error: "見つかりませんでした。" },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}
