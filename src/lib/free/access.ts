/**
 * 無料診断（`/` と `/meo` とその裏の API 5 本）に入れるかどうか。サーバー専用。
 *
 * 利用者の決定（2026-10-02）: 無料診断はお客様のアカウントでは使わない（登録後の「2 回まで」は廃止）。
 * 別リンク（/free/login）で 1 組の ID とパスワード（環境変数）を入れた人だけが、回数制限なしで使う。
 * 運用者・管理アカウントの「デモ用の月 50 回」もこれに一本化した（Clerk のログインとは独立）。
 *
 *   FREE_DIAGNOSIS_ID と FREE_DIAGNOSIS_PASSWORD が両方ある … 署名付き Cookie（session-rules.ts）がある人だけ通す
 *   どちらも無い                                      … Clerk が有効（本番相当）なら閉じる。無効（開発・E2E）なら素通り
 *
 * 画面（src/lib/free/gate.ts）と API（requireFreeAccess）の両方がここを使う。proxy.ts はこれらのパスを
 * 「公開」として素通しするので、API ハンドラ側で必ず requireFreeAccess() を呼ぶこと。
 */
import { timingSafeEqual, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { isAuthEnabled } from "@/lib/auth/config";
import { NO_STORE } from "@/lib/api/headers";
import { FREE_LOGIN_CODE, FREE_LOGIN_PATH, FREE_SESSION_COOKIE, freeSessionExpiry, freeSessionKey, signFreeSession, verifyFreeSession } from "./session-rules";

export { FREE_LOGIN_PATH } from "./session-rules";

function envValue(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** ID とパスワードが両方設定されているか（値は返さない） */
export function isFreeLoginConfigured(): boolean {
  return envValue("FREE_DIAGNOSIS_ID") !== null && envValue("FREE_DIAGNOSIS_PASSWORD") !== null;
}

/**
 * 無料診断を「誰でも」使える環境か（Clerk も専用ログインも無い開発・E2E）。
 * 本番で両方が未設定なら false（閉じる方向に倒す）。
 */
export function isFreeOpenWithoutLogin(): boolean {
  return !isFreeLoginConfigured() && !isAuthEnabled();
}

function credentials(): { id: string; password: string } | null {
  const id = envValue("FREE_DIAGNOSIS_ID");
  const password = envValue("FREE_DIAGNOSIS_PASSWORD");
  return id && password ? { id, password } : null;
}

function digest(s: string): Buffer {
  return createHash("sha256").update(s, "utf8").digest();
}

/** 入力の ID とパスワードが合っているか。比較は長さに依らず一定時間（ハッシュ同士を比べる） */
export function verifyFreeLogin(id: unknown, password: unknown): boolean {
  const cred = credentials();
  if (!cred || typeof id !== "string" || typeof password !== "string") return false;
  const idOk = timingSafeEqual(digest(id.trim()), digest(cred.id));
  const pwOk = timingSafeEqual(digest(password), digest(cred.password));
  return idOk && pwOk;
}

/** いまのリクエストの Cookie に有効な無料診断のセッションがあるか */
export async function hasFreeSession(): Promise<boolean> {
  const cred = credentials();
  if (!cred) return false;
  const jar = await cookies();
  const value = jar.get(FREE_SESSION_COOKIE)?.value;
  if (!value) return false;
  return verifyFreeSession(value, await freeSessionKey(cred.id, cred.password));
}

/** 無料診断に入れるか（専用ログイン済み、または誰でも使える環境） */
export async function hasFreeAccess(): Promise<boolean> {
  if (isFreeOpenWithoutLogin()) return true;
  return hasFreeSession();
}

/** ログイン成功時に Cookie を置く（Secure は本番だけ。開発の http://localhost でも動くように） */
export async function issueFreeSession(): Promise<void> {
  const cred = credentials();
  if (!cred) throw new Error("無料診断の ID とパスワードが未設定です");
  const expiresAt = freeSessionExpiry();
  const value = await signFreeSession(expiresAt, await freeSessionKey(cred.id, cred.password));
  const jar = await cookies();
  jar.set(FREE_SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

/** ログアウト（Cookie を消す） */
export async function clearFreeSession(): Promise<void> {
  const jar = await cookies();
  jar.set(FREE_SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

/** ログインが要るときの API の応答。画面はこの code を見て /free/login へ送る */
export function freeLoginRequiredResponse(): Response {
  const configured = isFreeLoginConfigured();
  return Response.json(
    {
      error: configured ? "無料診断を使うには専用のログインが必要です。" : "無料診断は現在ご利用いただけません。",
      code: FREE_LOGIN_CODE,
      loginPath: configured ? FREE_LOGIN_PATH : null,
    },
    { status: 401, headers: NO_STORE },
  );
}

/** API ハンドラ用。入れなければ 401 の Response、入れれば null */
export async function requireFreeAccess(): Promise<Response | null> {
  if (await hasFreeAccess()) return null;
  return freeLoginRequiredResponse();
}
