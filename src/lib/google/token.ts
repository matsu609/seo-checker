/**
 * ログイン中のユーザーの Google アクセストークンを Clerk から取る。サーバー専用。
 *
 * トークンそのものは Clerk が保持・更新するので、このアプリはデータベースを
 * 持たない。ここで取れるのは短命のアクセストークンだけで、リフレッシュトークンは
 * 触らない（ブラウザにも渡さない）。
 *
 * スコープは接続時に GoogleLinkPanel が要求する。Clerk のダッシュボードで足す
 * 必要はないが、Google 連携を「独自のクレデンシャル」にしてあることが前提。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { GoogleLinkError } from "./errors";
import { canUse, missingScopes, SERVICE_LABELS, type GoogleService } from "./scopes";

export interface GoogleToken {
  token: string;
  scopes: string[];
}

/** Google 連携の状態（画面に返してよい情報だけ。トークンは含めない） */
export interface GoogleConnection {
  connected: boolean;
  /** 実際に許可されたスコープ。canUse() で判定する */
  scopes: string[];
  /** 足りていないスコープ。connected が true でも空とは限らない */
  missingScopes: string[];
  /** 接続している Google アカウント（表示用） */
  email?: string;
}

/** 現在のユーザー ID。未ログインなら例外 */
async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new GoogleLinkError("ログインが必要です。", "unauthenticated");
  }
  return userId;
}

/**
 * ユーザーの Google アクセストークンを取る。
 * 接続していなければ not_connected を投げる。
 */
export async function getGoogleToken(): Promise<GoogleToken> {
  const userId = await requireUserId();
  const client = await clerkClient();
  let tokens;
  try {
    tokens = await client.users.getUserOauthAccessToken(userId, "google");
  } catch {
    throw new GoogleLinkError(
      "Google アカウントの接続情報を取得できませんでした。設定画面で接続し直してください。",
      "not_connected",
    );
  }
  const first = tokens.data[0];
  if (!first?.token) {
    throw new GoogleLinkError(
      "Google アカウントが接続されていません。設定画面から接続してください。",
      "not_connected",
    );
  }
  return { token: first.token, scopes: first.scopes ?? [] };
}

/** そのサービスに使えるトークンを取る。スコープが足りなければ例外 */
export async function getGoogleTokenFor(service: GoogleService): Promise<string> {
  const { token, scopes } = await getGoogleToken();
  if (!canUse(scopes, service)) {
    throw new GoogleLinkError(
      `${SERVICE_LABELS[service]} を読む権限が許可されていません。設定画面で Google アカウントを接続し直し、権限の確認画面で許可してください。`,
      "insufficient_scope",
    );
  }
  return token;
}

/** 画面に出すための接続状態。例外は投げず、未接続として返す */
export async function getGoogleConnection(): Promise<GoogleConnection> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { connected: false, scopes: [], missingScopes: [...missingScopes([])] };
  }
  const client = await clerkClient();
  try {
    const tokens = await client.users.getUserOauthAccessToken(userId, "google");
    const first = tokens.data[0];
    if (!first?.token) return { connected: false, scopes: [], missingScopes: [...missingScopes([])] };
    const user = await client.users.getUser(userId);
    const account = user.externalAccounts.find((a) => a.provider.includes("google"));
    const scopes = first.scopes ?? [];
    return {
      connected: true,
      scopes,
      missingScopes: missingScopes(scopes),
      email: account?.emailAddress || undefined,
    };
  } catch {
    return { connected: false, scopes: [], missingScopes: [...missingScopes([])] };
  }
}
