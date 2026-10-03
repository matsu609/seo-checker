/**
 * 無料診断（`/` と `/meo` とその裏の API）に入れるかどうか。サーバー専用。
 *
 * 利用者の決定（2026-10-02 → 10-03）: 無料診断はお客様のアカウントでは使わない。パスワードもトークンも置かない。
 * **固定リンク `/free`**（マスター画面にも表示）を開いた人に印の Cookie（30 日）を置き、その Cookie がある人だけ通す。
 * 「ばれたら終わり」は承知のうえ（利用者）。守りは月の回数上限（monthly.ts）だけ。
 *
 *   Clerk がある（本番相当）        … Cookie がある人だけ通す
 *   Clerk が無い（開発・E2E）       … 素通り
 *
 * 画面（gate.ts）と API（requireFreeAccess）の両方がここを使う。proxy.ts は無料診断のパスを「公開」として
 * 素通しするので、API ハンドラ側で必ず requireFreeAccess() を呼ぶこと。
 */
import { cookies } from "next/headers";
import { isAuthEnabled } from "@/lib/auth/config";
import { NO_STORE } from "@/lib/api/headers";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";
import { FREE_ACCESS_CODE, FREE_ENTRY_PATH, FREE_SESSION_COOKIE, FREE_SESSION_VALUE, freeSessionExpiry, isFreeSessionValue } from "./session-rules";

/** 無料診断を「誰でも」使える環境か（Clerk が無い開発・E2E。Cookie も見ない） */
export function isFreeOpenWithoutLogin(): boolean {
  return !isAuthEnabled();
}

/** 営業・代理店に渡す固定リンク（マスター画面に出す） */
export function freeLinkUrl(): string {
  return `${PUBLIC_APP_ORIGIN}${FREE_ENTRY_PATH}`;
}

export interface FreeSessionCookie {
  name: string;
  value: string;
  options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; expires: Date };
}

/** 置く Cookie（Route Handler が NextResponse に載せる） */
export function freeSessionCookie(now: number = Date.now()): FreeSessionCookie {
  return {
    name: FREE_SESSION_COOKIE,
    value: FREE_SESSION_VALUE,
    // Secure は本番だけ（開発の http://localhost でも動くように）
    options: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires: new Date(freeSessionExpiry(now)) },
  };
}

/** いまのリクエストの Cookie に印があるか */
export async function hasFreeSession(): Promise<boolean> {
  const jar = await cookies();
  return isFreeSessionValue(jar.get(FREE_SESSION_COOKIE)?.value);
}

/** 無料診断に入れるか（固定リンクを開いた人、または誰でも使える環境） */
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
    { error: `無料診断を使うには、無料診断のリンク（${FREE_ENTRY_PATH}）をもう一度開いてください。`, code: FREE_ACCESS_CODE },
    { status: 401, headers: NO_STORE },
  );
}

/** API ハンドラ用。入れなければ 401 の Response、入れれば null */
export async function requireFreeAccess(): Promise<Response | null> {
  if (await hasFreeAccess()) return null;
  return freeAccessDeniedResponse();
}
