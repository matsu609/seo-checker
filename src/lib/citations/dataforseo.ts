/**
 * DataForSEO の Google 検索結果（Live）を 1 語ぶん取る。サーバー専用。
 *
 *   POST /v3/serp/google/organic/live/advanced
 *
 * 認証は AI 検索モニタリング・検索パフォーマンス（推定）と同じ Basic
 * （`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`）。1 回 = 1 リクエスト（数円）。
 * 応答の読み取りは壊れた値で例外を投げず、読めた行だけ返す。
 * 完全一致（"…"）の検索は 0 件が普通にあるので、空でもエラーにしない。
 */
import { DATAFORSEO_BASE, dataForSeoCredentials, defaultLocale, localeParams } from "@/lib/geo/dataforseo";
import type { RawSerpHit } from "./analyze";

export const SERP_PATH = "/serp/google/organic/live/advanced";
/** 1 語あたりに取る件数。サイテーションは上位 30 件で十分（増やすと単価が上がる） */
export const RESULT_DEPTH = 30;
const TIMEOUT_MS = 60_000;

export class CitationError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "quota" | "upstream" | "network",
  ) {
    super(message);
    this.name = "CitationError";
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 応答 → 通常の検索結果（organic）の配列（純関数）。task 単位の失敗は例外にする */
export function parseOrganic(payload: unknown): RawSerpHit[] {
  const out: RawSerpHit[] = [];
  let position = 0;
  for (const task of asArray(asRecord(payload).tasks)) {
    const t = asRecord(task);
    const status = typeof t.status_code === "number" ? t.status_code : null;
    if (status !== null && status >= 40000) {
      throw new CitationError(`DataForSEO がエラーを返しました（${str(t.status_message) || `code ${status}`}）`, "upstream");
    }
    for (const result of asArray(t.result)) {
      for (const item of asArray(asRecord(result).items)) {
        const row = asRecord(item);
        if (str(row.type) !== "organic") continue;
        const url = str(row.url);
        if (!/^https?:\/\//i.test(url)) continue;
        position += 1;
        const rank = typeof row.rank_absolute === "number" && row.rank_absolute >= 1 ? row.rank_absolute : position;
        out.push({ url, title: str(row.title), snippet: str(row.description), position: rank });
      }
    }
  }
  return out;
}

export interface SearchGoogleOptions {
  signal?: AbortSignal;
  /** テスト用。既定は global fetch */
  fetchImpl?: typeof fetch;
  depth?: number;
}

export async function searchGoogle(q: string, options: SearchGoogleOptions = {}): Promise<RawSerpHit[]> {
  const credentials = dataForSeoCredentials();
  if (!credentials) throw new CitationError("DATAFORSEO_LOGIN と DATAFORSEO_PASSWORD が未設定です", "config");
  const keyword = q.trim();
  if (!keyword) throw new CitationError("検索語が空です", "config");

  const { locationName, languageCode } = localeParams(defaultLocale());
  const body = [{ keyword, location_name: locationName, language_code: languageCode, depth: options.depth ?? RESULT_DEPTH }];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  const doFetch = options.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(`${DATAFORSEO_BASE}${SERP_PATH}`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (err) {
    throw new CitationError(
      err instanceof Error && err.name === "AbortError" ? "DataForSEO への接続がタイムアウトしました" : "DataForSEO に接続できませんでした",
      "network",
    );
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }

  if (res.status === 401 || res.status === 403) {
    throw new CitationError("DataForSEO の認証に失敗しました（ログインとパスワードを確認してください）", "auth");
  }
  if (res.status === 402 || res.status === 429) {
    throw new CitationError("DataForSEO の残高または回数制限に達しました", "quota");
  }
  if (!res.ok) throw new CitationError(`DataForSEO がエラーを返しました（HTTP ${res.status}）`, "upstream");

  const payload: unknown = await res.json().catch(() => null);
  return parseOrganic(payload);
}
