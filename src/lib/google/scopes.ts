/**
 * Google 連携で必要な OAuth スコープ。純粋関数だけを置く（テスト可能にするため）。
 *
 * 使うのは口コミ返信の Google ビジネス プロフィールと、SEO の「Google サーチコンソール連携」
 * （2026-09-23 に利用者の指示で再開。GA4 は使わないまま）。スコープはそれぞれの画面から
 * その場で要求する（ConnectBusinessButton / ConnectSearchConsoleButton の additionalScopes）。
 * Clerk のダッシュボードで足す必要はない。
 */

/**
 * Google ビジネス プロフィール（口コミの取得と返信の投稿）。書き込みを含む広いスコープで、
 * これより狭いものは無い。
 */
export const BUSINESS_PROFILE_SCOPE = "https://www.googleapis.com/auth/business.manage";

/** Search Console の読み取り専用（検索パフォーマンスとサイト一覧） */
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** 接続時に必ず要求するスコープ。無い（サービスごとに画面から要求する） */
export const REQUIRED_SCOPES: readonly string[] = [];

export type GoogleService = "business-profile" | "search-console";

export const SCOPE_BY_SERVICE: Record<GoogleService, string> = {
  "business-profile": BUSINESS_PROFILE_SCOPE,
  "search-console": SEARCH_CONSOLE_SCOPE,
};

export const SERVICE_LABELS: Record<GoogleService, string> = {
  "business-profile": "Google ビジネス プロフィール",
  "search-console": "Google サーチコンソール",
};

/** 権限が足りないときに、どこから足してもらうか（エラー文に使う） */
export const GRANT_HINTS: Record<GoogleService, string> = {
  "business-profile": "口コミの画面の「Google に口コミ返信の権限を追加する」から接続し直し、権限の確認画面で許可してください。",
  "search-console": "SEO の「Google サーチコンソール連携」の画面から接続し直し、権限の確認画面で許可してください。",
};

/** 付与されたスコープの一覧が、求めるスコープを満たしているか */
export function hasScope(granted: readonly string[], required: string): boolean {
  return granted.includes(required);
}

/** 足りていないスコープ（必須は無いので常に空配列） */
export function missingScopes(granted: readonly string[]): string[] {
  return REQUIRED_SCOPES.filter((s) => !hasScope(granted, s));
}

/** そのサービスを使えるか */
export function canUse(granted: readonly string[], service: GoogleService): boolean {
  return hasScope(granted, SCOPE_BY_SERVICE[service]);
}
