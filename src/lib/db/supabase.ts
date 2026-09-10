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

export interface RestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON にして送る本文 */
  body?: unknown;
  /** PostgREST の Prefer ヘッダ（例: return=representation） */
  prefer?: string;
  signal?: AbortSignal;
}

/**
 * `path` は `meo_reports?user_id=eq.xxx&order=...` のようにテーブル名から書く。
 * 応答の JSON をそのまま返す（形の検証は呼び出し側で zod を使う）。
 */
export async function supabaseRest<T = unknown>(path: string, options: RestOptions = {}): Promise<T> {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    throw new DbError("not_configured", "保存機能には SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY の設定が必要です");
  }

  const headers: Record<string, string> = {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: "application/json",
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.prefer) headers.prefer = options.prefer;

  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/${path}`, {
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
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new DbError("upstream", "データベースの応答を読めませんでした");
  }
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
