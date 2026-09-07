/**
 * GA4 Data API のサービスアカウント認証（依存パッケージを足さずに node:crypto だけで行う）。
 *
 * 手順は Google の "OAuth 2.0 for Server to Server Applications" どおり:
 *   1. サービスアカウント JSON から client_email と private_key を取り出す
 *   2. {alg:RS256,typ:JWT} . {iss,scope,aud,exp,iat} を秘密鍵で署名して JWS を作る
 *   3. grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer で /token に渡し、アクセストークンを得る
 *
 * 署名は buildAssertion / signJws という純関数に閉じてあり、テストは自前で生成した
 * RSA 鍵で署名 → node:crypto で検証する（ネットワークに出ない）。
 * トークンは失効の 5 分前まで使い回す（GA4 を叩くたびに /token を呼ばない）。
 */
import { createSign } from "node:crypto";
import { Ga4Error, type ServiceAccount } from "./types";

export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GA4_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
export const JWT_BEARER_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:jwt-bearer";

/** JWT の有効期間（Google の上限は 1 時間） */
export const ASSERTION_LIFETIME_SEC = 3600;
/** 失効のどれだけ前に取り直すか */
export const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_TIMEOUT_MS = 15_000;

export interface JwtClaims {
  iss: string;
  scope: string;
  aud: string;
  exp: number;
  iat: number;
  /** ドメイン全体の委任を使うときだけ */
  sub?: string;
}

export function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * 署名対象（鍵 + クレーム）→ JWS。純関数なのでテストで署名を検証できる。
 * ヘッダーは固定の {alg:"RS256",typ:"JWT"}。
 */
export function signJws(claims: JwtClaims, privateKey: string): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  let signature: Buffer;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    signature = signer.sign(privateKey);
  } catch {
    // 鍵が PEM として読めない（改行が潰れている等）
    throw new Ga4Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON の private_key を秘密鍵として読み込めませんでした",
      "config",
    );
  }
  return `${signingInput}.${base64url(signature)}`;
}

/** サービスアカウント → 署名済みアサーション（JWS） */
export function buildAssertion(
  account: ServiceAccount,
  options: { now?: Date; scope?: string; lifetimeSec?: number } = {},
): string {
  const now = options.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const claims: JwtClaims = {
    iss: account.clientEmail,
    scope: options.scope ?? GA4_SCOPE,
    aud: account.tokenUri,
    exp: iat + (options.lifetimeSec ?? ASSERTION_LIFETIME_SEC),
    iat,
  };
  return signJws(claims, account.privateKey);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function decodeMaybeBase64(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) throw new Ga4Error("GOOGLE_SERVICE_ACCOUNT_JSON が空です", "config");
  // まず生 JSON として読む。ダメなら base64 とみなす（改行込みの JSON を .env に書けないため）
  try {
    return JSON.parse(trimmed);
  } catch {
    let decoded: string;
    try {
      decoded = Buffer.from(trimmed, "base64").toString("utf8");
    } catch {
      throw new Ga4Error("GOOGLE_SERVICE_ACCOUNT_JSON を JSON としても base64 としても読み込めませんでした", "config");
    }
    try {
      return JSON.parse(decoded);
    } catch {
      throw new Ga4Error("GOOGLE_SERVICE_ACCOUNT_JSON を JSON としても base64 としても読み込めませんでした", "config");
    }
  }
}

/**
 * サービスアカウント JSON（生 JSON でも base64 でも可）を読む。
 * .env に 1 行で書くと改行が \n のまま残るので、PEM の改行を復元する。
 */
export function parseServiceAccount(raw: string): ServiceAccount {
  const json = decodeMaybeBase64(raw);
  if (!isRecord(json)) {
    throw new Ga4Error("GOOGLE_SERVICE_ACCOUNT_JSON の形式が違います（JSON オブジェクトを指定してください）", "config");
  }
  const clientEmail = typeof json.client_email === "string" ? json.client_email.trim() : "";
  const privateKeyRaw = typeof json.private_key === "string" ? json.private_key : "";
  if (!clientEmail || !privateKeyRaw) {
    throw new Ga4Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON に client_email または private_key がありません",
      "config",
    );
  }
  const tokenUri = typeof json.token_uri === "string" && json.token_uri.trim() ? json.token_uri.trim() : TOKEN_ENDPOINT;
  return {
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
    tokenUri,
  };
}

/** GOOGLE_SERVICE_ACCOUNT_JSON から読む。未設定なら null（呼び出し側が SetupNotice を出す） */
export function serviceAccountFromEnv(): ServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (typeof raw !== "string" || !raw.trim()) return null;
  return parseServiceAccount(raw);
}

export interface AccessToken {
  token: string;
  /** エポックミリ秒。この時刻に失効する */
  expiresAt: number;
}

export interface TokenFetchOptions {
  fetchImpl?: typeof fetch;
  now?: Date;
  timeoutMs?: number;
}

/** /token を 1 回叩く（キャッシュしない）。テストは fetchImpl を差し替える */
export async function fetchAccessToken(
  account: ServiceAccount,
  options: TokenFetchOptions = {},
): Promise<AccessToken> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const assertion = buildAssertion(account, { now });
  const body = new URLSearchParams({ grant_type: JWT_BEARER_GRANT_TYPE, assertion });

  let res: Response;
  try {
    res = await fetchImpl(account.tokenUri, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: body.toString(),
      signal: AbortSignal.timeout(options.timeoutMs ?? TOKEN_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new Ga4Error("Google の認証サーバーに接続できませんでした", "upstream");
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const detail = isRecord(json) && typeof json.error_description === "string" ? json.error_description : "";
    throw new Ga4Error(
      `GA4 のアクセストークンを取得できませんでした（サービスアカウントの設定を確認してください）${detail ? `: ${detail}` : ""}`,
      res.status === 400 || res.status === 401 ? "config" : "upstream",
      res.status,
    );
  }
  const token = isRecord(json) && typeof json.access_token === "string" ? json.access_token : "";
  if (!token) {
    throw new Ga4Error("GA4 のアクセストークンを取得できませんでした（応答に access_token がありません）", "upstream");
  }
  const expiresIn = isRecord(json) && typeof json.expires_in === "number" ? json.expires_in : ASSERTION_LIFETIME_SEC;
  return { token, expiresAt: now.getTime() + expiresIn * 1000 };
}

/* ───────────── トークンキャッシュ ───────────── */

const tokenCache = new Map<string, AccessToken>();

function cacheKey(account: ServiceAccount): string {
  return `${account.clientEmail}|${account.tokenUri}`;
}

/** キャッシュがまだ使えるか（失効の TOKEN_EXPIRY_MARGIN_MS 前で切る） */
export function isTokenFresh(entry: AccessToken | undefined, nowMs: number): entry is AccessToken {
  return Boolean(entry) && nowMs < (entry as AccessToken).expiresAt - TOKEN_EXPIRY_MARGIN_MS;
}

/** テスト・鍵の入れ替え用 */
export function clearTokenCache(): void {
  tokenCache.clear();
}

/** アクセストークン。失効の 5 分前までは同じものを使い回す */
export async function getAccessToken(
  account: ServiceAccount,
  options: TokenFetchOptions = {},
): Promise<string> {
  const now = options.now ?? new Date();
  const key = cacheKey(account);
  const cached = tokenCache.get(key);
  if (isTokenFresh(cached, now.getTime())) return cached.token;
  const fresh = await fetchAccessToken(account, { ...options, now });
  tokenCache.set(key, fresh);
  return fresh.token;
}
