/**
 * Supabase（PostgreSQL）への薄いクライアント。サーバー専用。
 *
 * SDK は足さず、PostgREST（`/rest/v1/<table>`）を fetch で叩く。
 * 認証は service_role キー（RLS を素通りする管理者キー）なので、
 * 行の絞り込み（user_id = ログイン中のユーザー）は呼び出し側が必ず付ける。
 * ブラウザにはキーも URL も渡さない（`NEXT_PUBLIC_` を付けない）。
 *
 * 環境変数が無ければ isSupabaseConfigured() が false になり、
 * 保存系の機能は画面ごと出さない（他の連携と同じ方針）。
 */

export type DbErrorCode = "not_configured" | "upstream" | "invalid";

export class DbError extends Error {
  constructor(
    public readonly code: DbErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "DbError";
  }
}

function env(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export function isSupabaseConfigured(): boolean {
  return env("SUPABASE_URL") !== null && env("SUPABASE_SERVICE_ROLE_KEY") !== null;
}

/**
 * SUPABASE_URL の正規化。ダッシュボードの「Data API」画面は `.../rest/v1/` まで
 * 含んだ URL をコピーさせるので、どちらを貼られても同じ土台にする。
 */
export function normalizeSupabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "")
    .replace(/\/+$/, "");
}

/**
 * 認証ヘッダ。鍵の形式が 2 種類ある:
 * - 従来の service_role（JWT。`eyJ` で始まる）: apikey と Authorization: Bearer の両方
 * - 新しい Secret key（`sb_secret_` で始まる）: apikey だけ（JWT ではないので Bearer に載せない）
 * どちらも RLS を素通りする管理者権限。
 */
export function supabaseAuthHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  return headers;
}

export interface RestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON にして送る本文 */
  body?: unknown;
  /** PostgREST の Prefer ヘッダ（例: return=representation） */
  prefer?: string;
  signal?: AbortSignal;
}

/** 認証・URL・エラーの扱いをそろえた 1 回の呼び出し（本文の読み取りは呼び出し側） */
async function send(path: string, options: Omit<RestOptions, "method"> & { method?: RestOptions["method"] | "HEAD" }): Promise<Response> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new DbError("not_configured", "保存機能には SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY の設定が必要です");
  }

  const headers: Record<string, string> = {
    ...supabaseAuthHeaders(key),
    accept: "application/json",
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.prefer) headers.prefer = options.prefer;

  let res: Response;
  try {
    res = await fetch(`${normalizeSupabaseUrl(url)}/rest/v1/${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      cache: "no-store",
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    throw new DbError("upstream", "データベースに接続できませんでした");
  }

  if (!res.ok) {
    // PostgREST のエラー本文はここで捨てる（テーブル名や SQL を画面に出さない）
    const hint = res.status === 404 ? "テーブルが見つかりません（SQL の実行を確認してください）" : `データベースがエラーを返しました（HTTP ${res.status}）`;
    throw new DbError("upstream", hint, res.status);
  }
  return res;
}

/**
 * `path` は `meo_reports?user_id=eq.xxx&order=...` のようにテーブル名から書く。
 * 応答の JSON をそのまま返す（形の検証は呼び出し側で zod を使う）。
 */
export async function supabaseRest<T = unknown>(path: string, options: RestOptions = {}): Promise<T> {
  const res = await send(path, options);
  // 本文が無い応答（204 No Content と、Prefer: return=minimal の 200 / 201）は undefined
  // PostgREST は return=minimal の POST に 201 Created + 空本文を返すので、
  // status だけで判断すると res.json() が必ず失敗する（2026-09-19 の不具合）
  if (res.status === 204 || res.status === 205) return undefined as T;
  const text = await res.text();
  if (text.trim() === "") return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DbError("upstream", "データベースの応答を読めませんでした");
  }
}

/** `Content-Range` の総数（`0-24/1234` の 1234。HEAD では範囲が `*` になる）。読めなければ null */
export function totalFromContentRange(value: string | null): number | null {
  const m = /\/(\d+)\s*$/.exec(value ?? "");
  return m ? Number(m[1]) : null;
}

/**
 * 条件に合う行の数（`Prefer: count=exact` の HEAD。行そのものは受け取らない）。
 *
 * 2026-09-23: 件数だけ欲しい集計（月次レポートの投稿数など）が `select=id&limit=1000` で行を
 * 全部受け取って数えていた。Supabase は 1 回の応答を既定で 1,000 行に切るので、それを超えると
 * 黙って 1,000 になる。総数はデータベースに数えさせる。
 */
export async function supabaseCount(path: string, options: { signal?: AbortSignal } = {}): Promise<number> {
  const res = await send(path, { method: "HEAD", prefer: "count=exact", signal: options.signal });
  const total = totalFromContentRange(res.headers.get("content-range"));
  if (total === null) throw new DbError("upstream", "データベースの応答から件数を読めませんでした");
  return total;
}

/**
 * Supabase（PostgREST）が 1 回の応答で返す行数の上限。プロジェクトの設定「Max rows」の既定値。
 * 設定で下げたときはここも同じ値に下げる（上限より大きい limit を頼むと、黙って上限で切られる）。
 */
export const DB_PAGE_SIZE = 1000;

/**
 * 1,000 行を超えうる一覧を、ページに分けて最後まで（最大 `max` 行）読む。
 *
 * 2026-09-23: `limit=2000` のように上限を超える行数を 1 回で頼んでいた箇所が、黙って 1,000 行で
 * 切られていた（週 1 回の一斉更新の対象・月次レポートの対象者・お知らせの集計）。
 * `path` には limit / offset を付けない。**order は必ず付けて、同じ値が並ばない列で終える**
 * （id など。並びが決まらないと、ページの境目で行が重複・欠落する）。
 */
export async function selectAllPages(path: string, { max, pageSize = DB_PAGE_SIZE }: { max: number; pageSize?: number }): Promise<unknown[]> {
  const out: unknown[] = [];
  const size = Math.max(1, Math.min(pageSize, DB_PAGE_SIZE));
  while (out.length < max) {
    const want = Math.min(size, max - out.length);
    const offset = out.length > 0 ? `&offset=${out.length}` : "";
    const rows = await supabaseRest<unknown>(`${path}&limit=${want}${offset}`);
    if (!Array.isArray(rows)) throw new DbError("upstream", "データベースの応答を読めませんでした");
    out.push(...rows);
    if (rows.length < want) break;
  }
  return out;
}

/** DbError を API 応答に変える（他の *ErrorResponse と同じ形） */
export function dbErrorResponse(err: unknown): Response {
  if (err instanceof DbError) {
    const status = err.code === "not_configured" ? 503 : err.code === "invalid" ? 400 : 502;
    return Response.json({ error: err.message, code: err.code }, { status });
  }
  console.error("[db] 想定外のエラー", err);
  return Response.json({ error: "データベースの処理に失敗しました", code: "upstream" }, { status: 502 });
}
