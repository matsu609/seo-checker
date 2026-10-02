/**
 * 無料診断（`/` と `/meo` とその裏の API）に入れるかどうか。サーバー専用。
 *
 * 利用者の決定（2026-10-02）: 無料診断はお客様のアカウントでは使わない。パスワードも置かない。
 * **推測できない専用リンク**（`/free/<トークン>`。マスター画面に表示）を開いた人に署名付き Cookie（30 日）を置き、
 * その Cookie がある人だけ通す。使いすぎは月の回数上限（monthly.ts）で止める。
 * 運用者は Clerk でログインしていれば `/free`（トークン無し）からも入れる（サイドバー）。
 *
 * 秘密は FREE_LINK_SECRET（任意）。無ければ CLERK_SECRET_KEY から派生させる（追加の設定なしで動く。
 * 派生は一方向なので、リンクが漏れても Clerk の鍵は分からない）。秘密を変えるとリンクも配り済みの Cookie も無効になる。
 *
 *   秘密がある                 … Cookie がある人だけ通す
 *   秘密も Clerk も無い（開発・E2E） … 素通り
 *
 * 画面（gate.ts）と API（requireFreeAccess）の両方がここを使う。proxy.ts は無料診断のパスを「公開」として
 * 素通しするので、API ハンドラ側で必ず requireFreeAccess() を呼ぶこと。
 */
import { cookies } from "next/headers";
import { isAuthEnabled } from "@/lib/auth/config";
import { NO_STORE } from "@/lib/api/headers";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";
import { constantTimeEqual, FREE_ACCESS_CODE, FREE_LINK_PREFIX, FREE_SESSION_COOKIE, freeLinkToken, freeSessionExpiry, freeSessionKey, signFreeSession, verifyFreeSession } from "./session-rules";

function envValue(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** リンクと Cookie の元になる秘密。値は外に出さない */
function freeSecret(): string | null {
  return envValue("FREE_LINK_SECRET") ?? envValue("CLERK_SECRET_KEY");
}

/** 専用リンクが作れる状態か（秘密があるか） */
export function isFreeLinkConfigured(): boolean {
  return freeSecret() !== null;
}

/** 無料診断を「誰でも」使える環境か（秘密も Clerk も無い開発・E2E） */
export function isFreeOpenWithoutLogin(): boolean {
  return !isFreeLinkConfigured() && !isAuthEnabled();
}

/** 専用リンクのパス（`/free/<トークン>`）。秘密が無ければ null */
export async function freeLinkPath(): Promise<string | null> {
  const secret = freeSecret();
  if (!secret) return null;
  return `${FREE_LINK_PREFIX}${await freeLinkToken(secret)}`;
}

/** 専用リンクの絶対 URL（マスター画面でコピーして渡す）。秘密が無ければ null */
export async function freeLinkUrl(): Promise<string | null> {
  const path = await freeLinkPath();
  return path ? `${PUBLIC_APP_ORIGIN}${path}` : null;
}

/** URL のトークンが合っているか（一定時間で比べる） */
export async function isValidFreeToken(token: string): Promise<boolean> {
  const secret = freeSecret();
  if (!secret || typeof token !== "string") return false;
  return constantTimeEqual(token, await freeLinkToken(secret));
}

export interface FreeSessionCookie {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; expires: Date };
}

/** 置く Cookie（Route Handler が NextResponse に載せる）。秘密が無ければ null */
export async function freeSessionCookie(): Promise<FreeSessionCookie | null> {
  const secret = freeSecret();
  if (!secret) return null;
  const expiresAt = freeSessionExpiry();
  const value = await signFreeSession(expiresAt, await freeSessionKey(secret));
  return {
    name: FREE_SESSION_COOKIE,
    value,
    // Secure は本番だけ（開発の http://localhost でも動くように）
    options: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(expiresAt) },
  };
}

/** いまのリクエストの Cookie に有効なセッションがあるか */
export async function hasFreeSession(): Promise<boolean> {
  const secret = freeSecret();
  if (!secret) return false;
  const jar = await cookies();
  const value = jar.get(FREE_SESSION_COOKIE)?.value;
  if (!value) return false;
  return verifyFreeSession(value, await freeSessionKey(secret));
}

/** 無料診断に入れるか（専用リンクを開いた人、または誰でも使える環境） */
export async function hasFreeAccess(): Promise<boolean> {
  if (isFreeOpenWithoutLogin()) return true;
  return hasFreeSession();
}

/** 「診断を終える」（Cookie を消す。Route Handler から） */
export async function clearFreeSession(): Promise<void> {
  const jar = await cookies();
  jar.set(FREE_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** 入れないときの API の応答（Cookie が無い・30 日が過ぎた） */
export function freeAccessDeniedResponse(): Response {
  return Response.json(
    { error: "無料診断を使うには、運営者から受け取った専用リンクをもう一度開いてください。", code: FREE_ACCESS_CODE },
    { status: 401, headers: NO_STORE },
  );
}

/** API ハンドラ用。入れなければ 401 の Response、入れれば null */
export async function requireFreeAccess(): Promise<Response | null> {
  if (await hasFreeAccess()) return null;
  return freeAccessDeniedResponse();
}
