/**
 * Route Handler が URL の入力と FetchError を返すときの共通部品（サーバー専用）。
 *
 * 2026-09-23 に各ルートの複製をまとめた。以前は HP 改修提案・FAQ 提案だけ
 * `blocked_host ? 400 : 502` で、形式の誤った URL（invalid_url）を 502（相手サイトの障害）として
 * 返していた。ステータスは多数派のルートに合わせる: invalid_url / blocked_host は 400（入力の問題）、
 * それ以外（timeout / network / too_large）は 502（取得先の問題）。
 */
import { assertPublicHost, FetchError, normalizeUrl } from "./fetch";

/** FetchError → HTTP ステータス */
export function fetchErrorStatus(err: FetchError): number {
  return err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
}

/** FetchError → `{ error, code }` の JSON 応答 */
export function fetchErrorResponse(err: FetchError, init: { headers?: HeadersInit } = {}): Response {
  return Response.json({ error: err.message, code: err.code }, { status: fetchErrorStatus(err), ...init });
}

/**
 * 入力 URL を検査する（形式と、内部ネットワークでないこと）。問題があれば 400 の応答、無ければ null。
 * 実費の出る処理（回数の消費・AI・クロールの枠）より前に呼ぶ。形式の誤りで回数を減らさないため。
 */
export async function publicUrlError(input: string): Promise<Response | null> {
  try {
    await assertPublicHost(normalizeUrl(input));
    return null;
  } catch (err) {
    if (err instanceof FetchError) return fetchErrorResponse(err);
    throw err;
  }
}

/**
 * キャッシュのキーにする URL。スキームとホストだけを小文字にし、パスとクエリの大文字小文字は残す
 * （`/About` と `/about` は別のページでありうる）。スキームの省略・末尾の `/` の有無は
 * normalizeUrl でそろう。2026-09-23: 以前は URL 全体を小文字にしていた。
 */
export function urlCacheKey(input: string): string {
  try {
    return normalizeUrl(input).toString();
  } catch {
    return input.trim();
  }
}
