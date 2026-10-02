/**
 * 無料診断の専用ログイン（利用者の決定 2026-10-02）の「署名付き Cookie」の純粋な部分。
 *
 * 無料診断（`/` と `/meo`）はお客様のアカウントでは使わない。別リンク（/free/login）で
 * 1 組の ID とパスワード（環境変数 FREE_DIAGNOSIS_ID / FREE_DIAGNOSIS_PASSWORD）を入れた人だけが、
 * 回数制限なしで使える。ログインできたら、この署名付き Cookie を置く。
 *
 * Cookie の値は `<有効期限(ms)>.<署名>`。署名は HMAC-SHA256（鍵 = ID とパスワードの SHA-256）なので、
 * ID かパスワードを変えると配っていた Cookie はすべて無効になる（配り直しの手段がそれだけで済む）。
 * Web Crypto だけを使い、Node と Edge（proxy.ts）のどちらでも動くようにしてある。
 *
 * ここは環境変数も next/headers も読まない（テストしやすく、クライアントからも import できる）。
 * 読む・置くのはサーバー専用の access.ts。
 */

/** Cookie の名前 */
export const FREE_SESSION_COOKIE = "free_diagnosis";
/** 有効期限（日）。デモで配ったリンクを毎回ログインし直さなくて済む長さにする */
export const FREE_SESSION_DAYS = 30;
/** ログイン画面のパス（ここだけが定義。routes.ts の公開範囲と一致させる） */
export const FREE_LOGIN_PATH = "/free/login";
/** ログインが要るときの API のエラーコード（画面はこれを見てログイン画面へ送る） */
export const FREE_LOGIN_CODE = "free_login";

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** ID とパスワードから署名の鍵を作る（SHA-256 のバイト列）。どちらかを変えると鍵も変わる */
export async function freeSessionKey(id: string, password: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(`${id}\u0000${password}`));
}

async function hmac(key: ArrayBuffer, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(await crypto.subtle.sign("HMAC", k, encoder.encode(message)));
}

/** 有効期限（ms）に署名して Cookie の値を作る */
export async function signFreeSession(expiresAt: number, key: ArrayBuffer): Promise<string> {
  const exp = String(Math.floor(expiresAt));
  return `${exp}.${await hmac(key, exp)}`;
}

/** 今から FREE_SESSION_DAYS 日後（ms） */
export function freeSessionExpiry(now: number = Date.now()): number {
  return now + FREE_SESSION_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Cookie の値を検証する。形が違う・署名が合わない・期限切れなら false。
 * 署名の比較は長さが同じときだけ 1 文字ずつ全部見る（早期 return で長さ以外の情報を漏らさない）。
 */
export async function verifyFreeSession(value: string | undefined | null, key: ArrayBuffer, now: number = Date.now()): Promise<boolean> {
  if (typeof value !== "string") return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d{1,16}$/.test(exp) || sig.length === 0) return false;
  const expected = await hmac(key, exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  if (diff !== 0) return false;
  return Number(exp) > now;
}
