/**
 * マスター画面・代理店画面のアクセス制御。サーバー専用。
 *
 * マスターの判定は「ログイン中 かつ 確認済みのメールが ADMIN_EMAILS に含まれる」。
 * 未確認のメールを許すと、管理者のアドレスで登録するだけで入れてしまうので、
 * verified なものだけを見る。
 *
 * 代理店の判定は「ログイン中 かつ publicMetadata.role が agency」。
 * publicMetadata は Backend API からしか書けないので、お客様が自分で付けることはできない。
 *
 * 認証が無効な環境（開発・E2E）でも、どちらも開けない。他人の請求情報が出る画面なので、
 * 鍵が無いときは通さないほうを既定にする。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { adminEmails, isAdminEmail } from "./config";
import { isAgencyMetadata } from "./roles";

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

/**
 * ログイン中のユーザーが代理店なら、その代理店のユーザー ID を返す。違えば null。
 * 「担当の一覧を引く鍵」そのものなので、ID は必ずこの関数から取る
 * （リクエストの本文で受け取った ID を信用すると、他の代理店の担当が見えてしまう）。
 */
export async function currentAgencyId(): Promise<string | null> {
  if (!isAuthEnabled()) return null;

  const { userId } = await auth();
  if (!userId) return null;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return isAgencyMetadata(user.publicMetadata) ? user.id : null;
  } catch {
    // 取れなければ代理店でない扱い（開ける方向には倒さない）
    return null;
  }
}

/** 代理店かどうか（画面の出し分け用） */
export async function isAgency(): Promise<boolean> {
  return (await currentAgencyId()) !== null;
}
