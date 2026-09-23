/**
 * DataForSEO の Google 検索結果（Live）を 1 語ぶん取る。サーバー専用。
 *
 *   POST /v3/serp/google/organic/live/advanced
 *
 * 認証は AI 検索モニタリング・検索パフォーマンス（推定）と同じ Basic
 * （`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`）。1 回 = 1 リクエスト（数円）。
 * 応答の読み取りは壊れた値で例外を投げず、読めた行だけ返す。
 * 完全一致（"…"）の検索は 0 件が普通にあるので、空でもエラーにしない。
 *
 * 送信・時間切れ・失敗の種類の読み替えは共通のクライアント（src/lib/dataforseo/client.ts。2026-09-23）。
 * 画面に出す文面はここで決める（以前と同じ文面）。
 */
import {
  apiFailure,
  asArray,
  asRecord,
  dataForSeoCredentials,
  DataForSeoNetworkError,
  kindFromHttpStatus,
  requestDataForSeo,
  type DataForSeoFailureKind,
} from "@/lib/dataforseo/client";
import { defaultLocale, localeParams } from "@/lib/geo/dataforseo";
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

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** 共通の失敗の種類 → この機能の種類（見つからない＝パス違いは DataForSEO 側のエラーとして扱う） */
function citationKind(kind: DataForSeoFailureKind): CitationError["kind"] {
  return kind === "auth" ? "auth" : kind === "quota" ? "quota" : "upstream";
}

/** 応答 → 通常の検索結果（organic）の配列（純関数）。task 単位の失敗は例外にする */
export function parseOrganic(payload: unknown): RawSerpHit[] {
  // 認証・残高の失敗は種類を付けて返す（以前は全部 upstream だった。2026-09-23）
  const failed = apiFailure(payload);
  if (failed) throw new CitationError(`DataForSEO がエラーを返しました（${failed.message}）`, citationKind(failed.kind));
  const out: RawSerpHit[] = [];
  let position = 0;
  for (const task of asArray(asRecord(payload).tasks)) {
    const t = asRecord(task);
    const status = typeof t.status_code === "number" ? t.status_code : null;
    if (status !== null && status >= 40000) {
      throw new CitationError(`DataForSEO がエラーを返しました（${text(t.status_message) || `code ${status}`}）`, "upstream");
    }
    for (const result of asArray(t.result)) {
      for (const item of asArray(asRecord(result).items)) {
        const row = asRecord(item);
        if (text(row.type) !== "organic") continue;
        const url = text(row.url);
        if (!/^https?:\/\//i.test(url)) continue;
        position += 1;
        const rank = typeof row.rank_absolute === "number" && row.rank_absolute >= 1 ? row.rank_absolute : position;
        out.push({ url, title: text(row.title), snippet: text(row.description), position: rank });
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
  if (!dataForSeoCredentials()) throw new CitationError("DATAFORSEO_LOGIN と DATAFORSEO_PASSWORD が未設定です", "config");
  const keyword = q.trim();
  if (!keyword) throw new CitationError("検索語が空です", "config");

  const { locationName, languageCode } = localeParams(defaultLocale());
  const body = [{ keyword, location_name: locationName, language_code: languageCode, depth: options.depth ?? RESULT_DEPTH }];

  let res;
  try {
    res = await requestDataForSeo(SERP_PATH, body, { fetchImpl: options.fetchImpl, signal: options.signal, timeoutMs: TIMEOUT_MS });
  } catch (err) {
    throw new CitationError(err instanceof DataForSeoNetworkError ? err.message : "DataForSEO に接続できませんでした", "network");
  }

  if (!res.ok) {
    const kind = kindFromHttpStatus(res.status);
    if (kind === "auth") throw new CitationError("DataForSEO の認証に失敗しました（ログインとパスワードを確認してください）", "auth");
    if (kind === "quota") throw new CitationError("DataForSEO の残高または回数制限に達しました", "quota");
    throw new CitationError(`DataForSEO がエラーを返しました（HTTP ${res.status}）`, "upstream");
  }
  return parseOrganic(res.payload);
}
