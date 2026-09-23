/**
 * マスター画面・顧客管理画面のアクセス制御。サーバー専用。
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
 *
 * 顧客 1 人への操作（割引・機能の個別開放・代理ログイン・ご意見への返答）は、
 * この 2 つをまとめた currentClientScope / requireClientAccess を通す（ファイル末尾）。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { adminEmails } from "./config";
import { isOperatorUser } from "./identity";
import { isAgencyMetadata, isManageableClient } from "./roles";

export async function isAdmin(): Promise<boolean> {
  if (!isAuthEnabled()) return false;
  const allowed = adminEmails();
  if (allowed.length === 0) return false;

  const { userId } = await auth();
  if (!userId) return false;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    // 確認済みのメールだけを見る（admin/identity.ts。定期処理・顧客一覧と同じ関数）
    return isOperatorUser(user, allowed);
  } catch {
    // 取れなければ管理者でない扱い（開ける方向には倒さない）
    return false;
  }
}

/** 権限が足りないときの応答。403 だと「その画面が存在すること」を教えてしまうので 404 にする */
function notFoundResponse(): Response {
  return Response.json(
    { error: "見つかりませんでした。" },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}

/** API ルート用。管理者でなければ 404 の Response を返す */
export async function requireAdmin(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return notFoundResponse();
}

/**
 * ログイン中のユーザーが管理アカウント（旧称: 代理店）なら、そのユーザー ID を返す。違えば null。
 * 立場は必ずセッションから取る（リクエストの本文で受け取った ID を信用すると、誰でも管理アカウントを名乗れる）。
 * 担当の割り当て（agencyId）は 2026-09-21 に廃止したので、この ID で絞り込む先はもう無い。
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

/**
 * 顧客管理の画面（/clients）と、顧客 1 人への操作をしてよい立場かどうか。
 *
 *   master  … 運用者（ADMIN_EMAILS）。全登録者が見える。システム側（/admin）も見える
 *   manager … 管理アカウント（publicMetadata.role = agency）。全登録者が見える（担当の割り当ては 2026-09-21 に廃止）
 *
 * どちらでもなければ null（画面は 404、API も 404）。
 */
export type ClientScope = { kind: "master" } | { kind: "manager"; agencyId: string };

export async function currentClientScope(): Promise<ClientScope | null> {
  if (await isAdmin()) return { kind: "master" };
  const agencyId = await currentAgencyId();
  return agencyId ? { kind: "manager", agencyId } : null;
}

/**
 * API ルート用。運用者か管理アカウントでなければ 404 の Response、そうならその立場を返す。
 *
 * **本文を読む前に呼ぶ**（2026-09-23）。先に本文を検証すると、権限の無い人に 400（入力が正しくない）が
 * 返って「この API は存在する」と教えてしまう。404 にそろえる意味が無くなる。
 */
export async function requireClientScope(): Promise<ClientScope | Response> {
  return (await currentClientScope()) ?? notFoundResponse();
}

/**
 * API ルート用。その顧客に触ってよいか調べ、だめなら 404 の Response を返す。
 *
 * 運用者と管理アカウントは、どちらも**全登録者**に触れる（利用者の指示 2026-09-21。
 * 担当による絞り込みはやめた）。唯一触れないのは**他の管理アカウント**で、宛先がそれなら 404
 * （存在そのものを教えない）。立場の判定は必ずセッションから取る（リクエストの値を信用しない）。
 * requireClientScope で取った立場を渡せば、Clerk への問い合わせを繰り返さない。
 */
export async function requireClientAccess(userId: string, known?: ClientScope): Promise<Response | null> {
  const scope = known ?? (await currentClientScope());
  if (!scope) return notFoundResponse();
  if (scope.kind === "master") return null;

  try {
    const client = await clerkClient();
    const target = await client.users.getUser(userId).catch(() => null);
    if (!target || !isManageableClient(target.publicMetadata)) return notFoundResponse();
    return null;
  } catch {
    // 取れなければ触らせない（開ける方向には倒さない）
    return notFoundResponse();
  }
}
