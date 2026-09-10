/**
 * どのパスがログイン不要かを決める。ここだけが公開範囲の定義。
 *
 * 方針:
 * - 無料診断（/）は見込み顧客に試してもらうための入口なので公開のまま。
 *   その裏側の API（analyze / site / faq）も公開でなければ画面が動かない。
 * - それ以外のツールと API は、外部 API の実費が出るのでログイン必須。
 *
 * proxy.ts（Next.js 16 で middleware.ts から改名）と、各 API ハンドラの
 * requireAuth() の両方がこの判定を使う。Next.js のドキュメントが
 * 「Proxy のマッチャ変更でカバーが静かに外れることがあるので、
 * ハンドラ内でも必ず検証せよ」と明記しているため、二重に守る。
 */

/** ログイン不要で開けるページ（無料診断と、登録前に読める利用規約） */
const PUBLIC_PAGES = new Set(["/", "/terms"]);

/**
 * ログイン不要で叩ける API。
 *
 * 前方一致ではなく完全一致で持つ。`/api/site` を前方一致にすると
 * `/api/site-audit` と `/api/site-report`（どちらも実費が出る）まで
 * 公開されてしまうため。
 */
const PUBLIC_APIS = new Set(["/api/analyze", "/api/site", "/api/faq"]);

/**
 * Clerk のサインイン・サインアップ画面（ここを保護するとログインできない）と、
 * Google の認可画面から戻る先。接続の途中でサインインへ飛ばすと流れが切れる。
 */
const AUTH_PAGE_PREFIXES = ["/sign-in", "/sign-up", "/sso-callback"];

/** 末尾のスラッシュを落とす（"/" はそのまま） */
export function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.replace(/\/+$/, "") || "/";
  return pathname;
}

/** ログイン不要で到達してよいパスか */
export function isPublicPath(pathname: string): boolean {
  const path = normalizePath(pathname);
  if (PUBLIC_PAGES.has(path)) return true;
  if (PUBLIC_APIS.has(path)) return true;
  // /sign-in, /sign-in/factor-one のようなキャッチオールも通す
  return AUTH_PAGE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** ログインが要るパスか（isPublicPath の裏返し。呼び出し側の意図を読みやすくする） */
export function isProtectedPath(pathname: string): boolean {
  return !isPublicPath(pathname);
}

/** 一覧の確認・ドキュメント生成用 */
export const PUBLIC_PATHS = {
  pages: [...PUBLIC_PAGES],
  apis: [...PUBLIC_APIS],
  authPrefixes: [...AUTH_PAGE_PREFIXES],
} as const;

/** 未ログインで API を叩かれたときの応答。proxy.ts と requireAuth() で同じものを返す */
export function unauthorizedResponse(): Response {
  return Response.json(
    { error: "この機能を使うにはログインが必要です。", code: "unauthorized" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}

/** API のパスか（画面はリダイレクト、API は 401 と出し分けるため） */
export function isApiPath(pathname: string): boolean {
  return normalizePath(pathname).startsWith("/api/");
}
