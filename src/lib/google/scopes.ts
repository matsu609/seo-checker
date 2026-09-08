/**
 * Google 連携で必要な OAuth スコープ。純粋関数だけを置く（テスト可能にするため）。
 *
 * スコープは Clerk のダッシュボードで Google 連携に追加してもらう。
 * ここは「実際に付与されたスコープで足りているか」を判定するだけ。
 */

/** Search Console の読み取り */
export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
/** GA4（Data API / Admin API の読み取り） */
export const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

export const REQUIRED_SCOPES = [SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE] as const;

export type GoogleService = "search-console" | "analytics";

export const SCOPE_BY_SERVICE: Record<GoogleService, string> = {
  "search-console": SEARCH_CONSOLE_SCOPE,
  analytics: ANALYTICS_SCOPE,
};

export const SERVICE_LABELS: Record<GoogleService, string> = {
  "search-console": "Search Console",
  analytics: "Google アナリティクス（GA4）",
};

/**
 * 読み取り専用スコープに対して、書き込みも含む広いスコープを持っていれば足りる。
 * Google は `.readonly` を付けない形も返すため、その対応表。
 */
const BROADER: Record<string, string[]> = {
  [SEARCH_CONSOLE_SCOPE]: ["https://www.googleapis.com/auth/webmasters"],
  [ANALYTICS_SCOPE]: [
    "https://www.googleapis.com/auth/analytics",
    "https://www.googleapis.com/auth/analytics.edit",
  ],
};

/** 付与されたスコープの一覧が、求めるスコープを満たしているか */
export function hasScope(granted: readonly string[], required: string): boolean {
  if (granted.includes(required)) return true;
  return (BROADER[required] ?? []).some((s) => granted.includes(s));
}

/** 足りていないスコープ（すべて満たしていれば空配列） */
export function missingScopes(granted: readonly string[]): string[] {
  return REQUIRED_SCOPES.filter((s) => !hasScope(granted, s));
}

/** そのサービスを使えるか */
export function canUse(granted: readonly string[], service: GoogleService): boolean {
  return hasScope(granted, SCOPE_BY_SERVICE[service]);
}
