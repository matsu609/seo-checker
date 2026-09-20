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

/**
 * ログイン不要で開けるページ（無料診断 2 本と、登録前に読める利用規約・プライバシーポリシー）。
 * 無料診断の画面は公開だが、ページ側（src/lib/free/gate.ts）が未ログインを登録フォームへ送る。
 *
 * `/robots.txt` と `/sitemap.xml` はクローラ向けの生成ファイル。proxy.ts のマッチャが
 * 拡張子で除外してもいるが、**マッチャの書き換えで静かに保護対象に戻ると
 * サイトマップが取得できなくなる**ので、公開範囲の定義にも明示しておく。
 */
const PUBLIC_PAGES = new Set(["/", "/meo", "/terms", "/privacy", "/legal/tokushoho", "/robots.txt", "/sitemap.xml"]);

/**
 * ログイン不要で開けるページの前方一致（末尾のスラッシュまで含めて比べる）。
 * `/r/<slug>` は来店客が店内の QR から開くアンケート（口コミ支援）。
 * `/r` 単体や `/rank` のような別のパスに広がらないよう、必ず `/` で終わる接頭辞にする。
 */
const PUBLIC_PAGE_PREFIXES = ["/r/"] as const;

/**
 * ログイン不要で叩ける API。
 *
 * 前方一致ではなく完全一致で持つ。
 *
 * 無料診断の API（`/api/analyze` `/api/site` `/api/faq` `/api/meo/search` `/api/meo/report`）は
 * 2026-09-18 からログイン必須（登録したメールアドレスごとに回数制限。src/lib/free/quota.ts）。
 * 画面（`/` `/meo`）は公開のままにして、ページ側が未ログインを登録フォームへ送る
 * （Proxy に任せると Clerk のログイン画面へ飛び、見込み客が登録にたどり着かないため）。
 * `/api/cron/daily`（日次の定期処理）と `/api/cron/geo-run` は Vercel の Cron が叩く（ログインは無い）。
 * `/api/cron/maps-refresh` は旧パス（手動用に残す）。
 * ハンドラ側が CRON_SECRET で守り、未設定なら動かない。
 */
const PUBLIC_APIS = new Set(["/api/cron/daily", "/api/cron/maps-refresh", "/api/cron/geo-run", "/api/billing/webhook"]);

/**
 * ログイン不要で叩ける API の前方一致。`/api/r/<slug>/...` は来店客のアンケート
 * （取得・回答・押下の記録・お店に直接伝える）。ハンドラ側が IP ごとの回数制限と
 * アンケートごとの 1 日の上限で守る（src/lib/free/ratelimit.ts）。
 * `/api/reviews/*`（店舗側の管理 API）は `/api/r/` に前方一致しないので保護されたまま。
 */
const PUBLIC_API_PREFIXES = ["/api/r/"] as const;

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
  // 接頭辞のあとに 1 文字以上あるときだけ（"/r/" や "/api/r/" そのものは公開しない）
  if (PUBLIC_PAGE_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length)) return true;
  if (PUBLIC_API_PREFIXES.some((p) => path.startsWith(p) && path.length > p.length)) return true;
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
  pagePrefixes: [...PUBLIC_PAGE_PREFIXES],
  apis: [...PUBLIC_APIS],
  apiPrefixes: [...PUBLIC_API_PREFIXES],
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
