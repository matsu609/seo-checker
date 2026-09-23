/**
 * Google API（Business Profile・Performance・Search Console）の呼び出しを 1 か所に。サーバー専用。
 *
 * Bearer・タイムアウト・通信エラーの分類・HTTP エラーの日本語化は、2026-09-23 まで
 * business-profile.ts / performance.ts / search-console/client.ts に同じ実装が 3 つあった
 * （403 / 404 の案内を差し替える mapError も 2 つ）。直し漏れが起きないようここに寄せる。
 * 画面に出る文言は寄せる前と 1 文字も変えていない（主語と助詞の間の空白も呼び出し側ごとに保つ）。
 *
 * エンドポイントは各モジュールの固定値（ユーザー入力の URL ではない）。
 */
import { GoogleLinkError, mapGoogleHttpError } from "./errors";
import type { GoogleService } from "./scopes";
import { getGoogleTokenFor } from "./token";

/** 呼び出し側（各 API のオプション）が渡せるもの */
export interface GoogleCallOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * アクセストークンの取り方。省略時はログイン中の利用者のもの（Clerk から取る）。
   * 定期処理は対象の利用者のものを、テストは固定の値を渡す。取得済みのトークンを使い回すときは
   * withResolvedToken() を通す（1 回の処理で Clerk に何度も聞かない）
   */
  getToken?: () => Promise<string>;
}

/** API ごとに決まっていること */
export interface GoogleApiSpec {
  /** エラー文の主語（「Google ビジネス プロフィール」「Search Console」） */
  label: string;
  /** 主語と助詞の間に空白を入れるか（英字で終わる「Search Console の…」は空ける） */
  spaced?: boolean;
  /** 省略時のトークンをどのサービスの権限で取るか */
  service: GoogleService;
  timeoutMs: number;
  /** HTTP エラー → 画面に出せるエラー。省略時は mapGoogleHttpError */
  mapError?: (status: number) => GoogleLinkError;
}

/**
 * 403 / 404 の案内だけを差し替え、ほかは mapGoogleHttpError（401 = 再接続、429 = 上限、その他）に任せる。
 * Business Profile 系の 403 は「権限」だけでなく「API 未有効・利用申請が未承認」のことが多いため。
 */
export function httpErrorMapper(label: string, messages: { forbidden?: string; notFound?: string } = {}): (status: number) => GoogleLinkError {
  return (status) => {
    if (status === 403 && messages.forbidden) return new GoogleLinkError(messages.forbidden, "forbidden");
    if (status === 404 && messages.notFound) return new GoogleLinkError(messages.notFound, "forbidden");
    return mapGoogleHttpError(status, label);
  };
}

function defaultToken(service: GoogleService): () => Promise<string> {
  return () => getGoogleTokenFor(service);
}

/**
 * トークンを 1 回だけ取り、以後はそれを返す getToken を付けたオプション。
 * ビジネス一覧（アカウント数 + 1 回）やインサイト（3〜4 回）のように、1 回の処理で何度も呼ぶときに使う。
 * 取得に失敗したときは、以後の呼び出しも同じ理由で失敗する（何度も聞き直さない）。
 */
export function withResolvedToken<T extends GoogleCallOptions>(options: T, service: GoogleService): T {
  const source = options.getToken ?? defaultToken(service);
  let pending: Promise<string> | null = null;
  return { ...options, getToken: () => (pending ??= source()) };
}

export async function callGoogleApi(url: string, init: RequestInit, spec: GoogleApiSpec, options: GoogleCallOptions = {}): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const token = await (options.getToken ?? defaultToken(spec.service))();
  const subject = spec.spaced ? `${spec.label} ` : spec.label;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? spec.timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new GoogleLinkError(timedOut ? `${subject}の応答がありませんでした（タイムアウト）` : `${subject}に接続できませんでした`, "network");
  }
  if (!res.ok) throw (spec.mapError ?? ((status: number) => mapGoogleHttpError(status, spec.label)))(res.status);
  // 返信の削除などは本文なし（204）
  if (res.status === 204) return {};
  try {
    return await res.json();
  } catch {
    throw new GoogleLinkError(`${subject}の応答を解釈できませんでした`, "network");
  }
}
