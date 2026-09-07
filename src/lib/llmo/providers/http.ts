/**
 * 他社 LLM を叩くための最小限の HTTP ヘルパ（サーバー専用）。
 *
 * SDK は追加しない（ARCHITECTURE.md）。ユーザー入力の URL は扱わないので
 * assertPublicHost の対象外だが、必ずタイムアウトを付ける。
 */

/** 1 回の呼び出しの既定タイムアウト（Web 検索付きの回答は遅い） */
export const DEFAULT_TIMEOUT_MS = 90_000;

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** 呼び出し側の signal とタイムアウトを合成する */
function withTimeout(timeoutMs: number, signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new ProviderError("応答がタイムアウトしました")), timeoutMs);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

/** レスポンス本文から API 側のエラーメッセージらしき文字列を拾う */
export function errorMessageOf(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const error = root.error;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message) return message;
  }
  const message = root.message;
  if (typeof message === "string" && message) return message;
  return null;
}

export interface PostJsonOptions {
  headers: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * JSON を POST して JSON を受け取る。失敗はすべて ProviderError にする。
 * 呼び出し元（各 provider の ask）が catch して typed な失敗結果に変換する。
 */
export async function postJson(url: string, options: PostJsonOptions): Promise<unknown> {
  const { signal, done } = withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      body: JSON.stringify(options.body),
      signal,
      cache: "no-store",
    });
    const text = await res.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    if (!res.ok) {
      const detail = errorMessageOf(payload) ?? text.slice(0, 200);
      throw new ProviderError(
        res.status === 401 || res.status === 403
          ? "API キーが拒否されました（権限またはキーを確認してください）"
          : res.status === 429
            ? "利用上限に達しました（しばらく待って再試行してください）"
            : `API がエラーを返しました（HTTP ${res.status}）${detail ? `: ${detail}` : ""}`,
        res.status,
      );
    }
    if (payload === null) throw new ProviderError("応答を JSON として解釈できませんでした");
    return payload;
  } catch (err) {
    if (err instanceof ProviderError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ProviderError("応答がタイムアウトしました（または中止されました）");
    }
    throw new ProviderError(err instanceof Error ? `接続に失敗しました: ${err.message}` : "接続に失敗しました");
  } finally {
    done();
  }
}

/** 失敗理由を日本語 1 行にする（provider 側の catch から使う） */
export function failureMessage(err: unknown): string {
  if (err instanceof ProviderError) return err.message;
  if (err instanceof Error) return err.message;
  return "不明なエラー";
}
