/**
 * 無料診断の「専用リンク」と「署名付き Cookie」の純粋な部分（利用者の決定 2026-10-02）。
 *
 * 無料診断（`/` と `/meo`）はお客様のアカウントでは使わない。パスワードも無い。
 * 守るのは**推測できない URL**（`/free/<トークン>`）だけで、「リンクの共有に気をつける」運用にする。
 * 開いた人には署名付き Cookie（30 日）を置き、以後は `/` と `/meo` を直接開ける。
 * 使いすぎは月の回数上限（monthly.ts）で止める。
 *
 * トークンも Cookie の鍵も、1 つの秘密（access.ts の freeSecret。既定は CLERK_SECRET_KEY から派生）から
 * HMAC で作る。秘密を変えるとリンクも配り済みの Cookie も全部無効になる。
 *
 * Cookie の値は `<有効期限(ms)>.<署名>`（署名 = HMAC-SHA256）。Web Crypto だけを使い、Node と Edge の
 * どちらでも動く。ここは環境変数も next/headers も読まない（テストしやすく、クライアントからも import できる）。
 */

/** Cookie の名前 */
export const FREE_SESSION_COOKIE = "free_diagnosis";
/** 有効期限（日）。デモで配ったリンクを毎回開き直さなくて済む長さにする */
export const FREE_SESSION_DAYS = 30;
/** 専用リンクのパスの前置き（`/free/<トークン>`）。routes.ts の公開範囲と一致させる */
export const FREE_LINK_PREFIX = "/free/";
/** 運用者が Clerk でログイン中に開く入口（トークン無し。サイドバーから） */
export const FREE_STAFF_ENTRY_PATH = "/free";
/** 入れないときの API のエラーコード（Cookie が無い・切れた） */
export const FREE_ACCESS_CODE = "free_link";
/** 今月の上限に達したときの API のエラーコード */
export const FREE_MONTHLY_CODE = "free_monthly";
/** トークンの長さ（base64url 24 文字 = 144 ビット。総当たりは現実的でない） */
export const FREE_TOKEN_LENGTH = 24;

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacRaw(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, encoder.encode(message));
}

async function hmac(key: ArrayBuffer, message: string): Promise<string> {
  return toBase64Url(await hmacRaw(key, message));
}

/** 秘密の文字列を鍵のバイト列にする（SHA-256） */
async function secretBytes(secret: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(secret));
}

/** 専用リンクのトークン（秘密から派生。秘密を変えるとリンクが変わる） */
export async function freeLinkToken(secret: string): Promise<string> {
  return (await hmac(await secretBytes(secret), "seo-checker:free-link:v1")).slice(0, FREE_TOKEN_LENGTH);
}

/** Cookie の署名の鍵（トークンとは別の鍵にして、トークンから署名を作れないようにする） */
export async function freeSessionKey(secret: string): Promise<ArrayBuffer> {
  return hmacRaw(await secretBytes(secret), "seo-checker:free-session:v1");
}

/** 2 つの文字列を長さに依らず一定時間で比べる（長さが違えば false） */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

/** Cookie の値を検証する。形が違う・署名が合わない・期限切れなら false */
export async function verifyFreeSession(value: string | undefined | null, key: ArrayBuffer, now: number = Date.now()): Promise<boolean> {
  if (typeof value !== "string") return false;
  const dot = value.indexOf(".");
  if (dot <= 0) return false;
  const exp = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^\d{1,16}$/.test(exp) || sig.length === 0) return false;
  if (!constantTimeEqual(await hmac(key, exp), sig)) return false;
  return Number(exp) > now;
}
