/**
 * Google 連携で必要な OAuth スコープ。純粋関数だけを置く（テスト可能にするため）。
 *
 * 2026-09-17 の利用者の決定で Search Console / GA4 を使わなくなったため、
 * 残るのは口コミ返信の Google ビジネス プロフィールだけ。接続は口コミ返信の画面から要求する
 * （ConnectBusinessButton の additionalScopes）。Clerk のダッシュボードで足す必要はない。
 */

/**
 * Google ビジネス プロフィール（口コミの取得と返信の投稿）。書き込みを含む広いスコープで、
 * これより狭いものは無い。
 */
export const BUSINESS_PROFILE_SCOPE = "https://www.googleapis.com/auth/business.manage";

/** 接続時に必ず要求するスコープ。無い（サービスごとに画面から要求する） */
export const REQUIRED_SCOPES: readonly string[] = [];

export type GoogleService = "business-profile";

export const SCOPE_BY_SERVICE: Record<GoogleService, string> = {
  "business-profile": BUSINESS_PROFILE_SCOPE,
};

export const SERVICE_LABELS: Record<GoogleService, string> = {
  "business-profile": "Google ビジネス プロフィール",
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
