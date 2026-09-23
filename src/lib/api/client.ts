/**
 * 画面（ブラウザ）から自前の API（`/api/*`）を呼ぶときの小さな共通処理。
 *
 * API のエラー応答は全ルート共通で `{ error: string }`（docs/dev/ARCHITECTURE.md「セキュリティ」）。
 * それを取り出せないとき（JSON でない・`error` が無い / 空）に出す文言は画面ごとに違うので、
 * 呼び出し側が `fallback` で渡す（外から見える文言なので、各画面の当時の文言をそのまま渡す）。
 *
 * 2026-09-23 まで、同じ実装が画面ごとに重複していた
 * （`errorMessage` 6 か所 + `lib/tools/run.ts`、`readError` 3 か所、`request` などの fetch の薄い包み 4 か所）。
 */

/** `error` を取り出せなかったときの文言。HTTP ステータスを入れたいときは関数で渡す */
export type ApiErrorFallback = string | ((status: number) => string);

/** 多くの画面が使っている既定の文言: 「リクエストに失敗しました（HTTP 500）」 */
export function requestFailedMessage(status: number): string {
  return `リクエストに失敗しました（HTTP ${status}）`;
}

/** 監視・投稿・月次レポートの画面が使っている短い文言: 「HTTP 500」 */
export function httpStatusMessage(status: number): string {
  return `HTTP ${status}`;
}

/** 失敗した応答から、画面に出すエラー文を取り出す（本文を読むので、呼んだ後の `res` は再利用できない） */
export async function apiErrorMessage(res: Response, fallback: ApiErrorFallback): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown } | null;
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答（プロキシのエラーページなど）
  }
  return typeof fallback === "function" ? fallback(res.status) : fallback;
}

/**
 * JSON の API を呼ぶ。
 *
 * - キャッシュは使わない（`cache: "no-store"`。`init` で上書きできる）
 * - 本文（`init.body`）があるときだけ `content-type: application/json` を付ける
 * - 2xx 以外は `apiErrorMessage` の文言で `Error` を投げる
 * - 204（本文なし）は `undefined` を返す
 */
export async function requestJson<T>(url: string, init: RequestInit | undefined, fallback: ApiErrorFallback): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(await apiErrorMessage(res, fallback));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
