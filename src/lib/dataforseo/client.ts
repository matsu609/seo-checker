/**
 * DataForSEO の共通クライアント（サーバー専用。2026-09-23 にまとめた）。
 *
 * 以前は AI 検索モニタリング（geo/dataforseo.ts）・サイテーション（citations/dataforseo.ts）・
 * 検索パフォーマンスの推定（search-estimate/dataforseo.ts）が、Basic 認証・時間切れと中断の配線・
 * 応答の読み取りの小道具・HTTP ステータスの読み替えをそれぞれ持っていた。その結果:
 *   - 検索パフォーマンスの推定だけ、中断のリスナーを外さず・`cache: "no-store"` が無く・
 *     本文を読む前に時間切れのタイマーを止めていた（本文の読み込みが止まると待ち続ける）
 *   - HTTP 402（残高不足）を読み替えていたのは検索パフォーマンスの推定だけ
 *   - タスク単位の失敗（status_code 40000 番台）の扱いがばらばら
 * ここは「送って、JSON を受け取って、失敗の種類を決める」までを持つ。画面に出す文面は
 * 呼び出し側（機能ごと）が決める（これまでの文面を変えないため）。
 *
 * 認証は Basic（login:password を base64）。`DATAFORSEO_LOGIN` と `DATAFORSEO_PASSWORD` の両方が要る。
 */

export const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";

/** 既定の時間切れ（ms）。Live のエンドポイントは数十秒かかることがある */
export const DEFAULT_TIMEOUT_MS = 30_000;

export function dataForSeoCredentials(): { login: string; password: string } | null {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  return login && password ? { login, password } : null;
}

export function isDataForSeoConfigured(): boolean {
  return dataForSeoCredentials() !== null;
}

function authHeader(login: string, password: string): string {
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

/* ───────────── 応答の読み取りの小道具（純関数） ───────────── */

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** 前後の空白を落とした文字列。文字列でない・空なら null */
export function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/* ───────────── 失敗の種類 ───────────── */

/**
 * 失敗の種類。画面の文面は呼び出し側が決める。
 *   auth      … 認証の失敗（鍵の設定を直すまで全部失敗する）
 *   quota     … 残高不足（402）・回数制限（429）。しばらく全部失敗する
 *   not-found … エンドポイントが無い（パスの設定違い）
 *   upstream  … それ以外の DataForSEO 側のエラー
 */
export type DataForSeoFailureKind = "auth" | "quota" | "not-found" | "upstream";

/** HTTP ステータス → 失敗の種類 */
export function kindFromHttpStatus(status: number): DataForSeoFailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402 || status === 429) return "quota";
  if (status === 404) return "not-found";
  return "upstream";
}

/**
 * DataForSEO の status_code（HTTP 200 のまま本文で返る。40000 番台が失敗）→ 失敗の種類。
 * 401xx = 認証、402xx = 残高・回数制限、404xx = パスが無い。
 */
export function kindFromApiCode(code: number): DataForSeoFailureKind {
  if (code >= 40100 && code < 40200) return "auth";
  if (code >= 40200 && code < 40300) return "quota";
  if (code >= 40400 && code < 40500) return "not-found";
  return "upstream";
}

/**
 * 応答の中の失敗（全体の status_code か、最初のタスクの status_code が 40000 以上）。
 * 無ければ null。message は DataForSEO の status_message（無ければ code）。
 */
export function apiFailure(payload: unknown): { code: number; message: string; kind: DataForSeoFailureKind } | null {
  const root = asRecord(payload);
  const task = asRecord(asArray(root.tasks)[0]);
  for (const node of [root, task]) {
    const code = typeof node.status_code === "number" ? node.status_code : null;
    if (code !== null && code >= 40000) {
      return { code, message: str(node.status_message) ?? `code ${code}`, kind: kindFromApiCode(code) };
    }
  }
  return null;
}

/* ───────────── 送信 ───────────── */

/** 通信そのものの失敗（届かなかった・時間切れ） */
export class DataForSeoNetworkError extends Error {
  constructor(
    message: string,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = "DataForSeoNetworkError";
  }
}

export interface DataForSeoRequestOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DataForSeoResponse {
  ok: boolean;
  status: number;
  /** 成功（2xx）のときの JSON。読めなければ null。失敗のときは読まない */
  payload: unknown;
}

/**
 * DataForSEO に POST する。**本文はタスクの配列**（API の約束。1 件でも配列で包む）。
 *
 * - 時間切れのタイマーは**本文を読み終えるまで**止めない（読み込みが止まっても待ち続けない）
 * - 呼び出し側の中断（signal）を伝え、終わったらリスナーを外す（長く動くプロセスで溜めない）
 * - キャッシュしない（`cache: "no-store"`。Next.js の fetch は既定でキャッシュすることがある）
 *
 * 鍵が無ければ呼ばない（呼び出し側が先に dataForSeoCredentials() を確かめる）。
 * 届かなかったとき・時間切れは DataForSeoNetworkError を投げる。HTTP の失敗は ok: false で返す。
 */
export async function requestDataForSeo(path: string, tasks: readonly unknown[], options: DataForSeoRequestOptions = {}): Promise<DataForSeoResponse> {
  const credentials = dataForSeoCredentials();
  if (!credentials) throw new Error("DATAFORSEO_LOGIN と DATAFORSEO_PASSWORD が未設定です");
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(`${DATAFORSEO_BASE}${path}`, {
      method: "POST",
      headers: {
        authorization: authHeader(credentials.login, credentials.password),
        "content-type": "application/json",
      },
      body: JSON.stringify(tasks),
      signal: controller.signal,
      cache: "no-store",
    });
    let payload: unknown = null;
    if (res.ok) {
      try {
        payload = await res.json();
      } catch (err) {
        // 本文を読んでいる途中の時間切れ・中断は通信の失敗。JSON でないだけなら payload は null
        if (controller.signal.aborted) throw err;
        payload = null;
      }
    }
    return { ok: res.ok, status: res.status, payload };
  } catch (err) {
    const aborted = timedOut || (err instanceof Error && err.name === "AbortError");
    throw new DataForSeoNetworkError(aborted ? "DataForSEO への接続がタイムアウトしました" : "DataForSEO に接続できませんでした", aborted);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
