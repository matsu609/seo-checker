/**
 * DataForSEO Labs から「そのドメインが順位を持っているキーワード」を取る。サーバー専用。
 *
 *   POST /v3/dataforseo_labs/google/ranked_keywords/live
 *
 * Search Console のクエリ一覧に最も近い代替物。**お客様がキーワードを手入力する必要が
 * 無くなる**のが、推定値そのものと同じくらい大きい。
 *
 * 認証は GEO と同じ Basic（`DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD`）。
 * パスは `DATAFORSEO_LABS_RANKED_PATH` で差し替えられるようにしてある。
 * DataForSEO 側のエンドポイント名が変わってもデプロイだけで追随するため。
 *
 * 応答の読み取りは**壊れた値で例外を投げない**方針（google/* と同じ）。
 * 読めない行は捨て、読めた行だけ返す。
 *
 * 送信・時間切れ・失敗の種類の読み替えは共通のクライアント（src/lib/dataforseo/client.ts。2026-09-23）。
 * 以前はここだけ、中断のリスナーを外さず・`cache: "no-store"` が無く・本文を読む前に
 * 時間切れのタイマーを止めていた。画面に出す文面はここで決める（以前と同じ文面）。
 */
import {
  apiFailure,
  asArray,
  asRecord,
  dataForSeoCredentials,
  DataForSeoNetworkError,
  kindFromHttpStatus,
  requestDataForSeo,
} from "@/lib/dataforseo/client";
import { localeParams, defaultLocale } from "@/lib/geo/dataforseo";
import type { RankedKeyword } from "./types";

const TIMEOUT_MS = 60_000;
const DEFAULT_PATH = "/dataforseo_labs/google/ranked_keywords/live";
/** 1 回に取る最大件数。増やすと単価が上がるので既定は控えめにする */
export const DEFAULT_LIMIT = 200;
export const MAX_LIMIT = 1000;

export class SearchEstimateError extends Error {
  constructor(
    message: string,
    readonly kind: "config" | "auth" | "quota" | "upstream" | "network",
  ) {
    super(message);
    this.name = "SearchEstimateError";
  }
}

export function rankedKeywordsPath(): string {
  return process.env.DATAFORSEO_LABS_RANKED_PATH?.trim() || DEFAULT_PATH;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}

/**
 * 応答 → キーワードの配列（純関数）。
 *
 * DataForSEO は入れ子が深く、項目が欠けることもある。ここでは
 * keyword / rank / search_volume / url を拾えるだけ拾う。
 */
export function parseRankedKeywords(payload: unknown): RankedKeyword[] {
  const tasks = asArray(asRecord(payload).tasks);
  const out: RankedKeyword[] = [];
  for (const task of tasks) {
    const t = asRecord(task);
    const status = numberOrNull(t.status_code);
    if (status !== null && status >= 40000) continue;
    for (const result of asArray(t.result)) {
      for (const item of asArray(asRecord(result).items)) {
        const row = asRecord(item);
        const keywordData = asRecord(row.keyword_data);
        const keyword = stringOrNull(keywordData.keyword);
        if (!keyword) continue;
        const info = asRecord(keywordData.keyword_info);
        const serpElement = asRecord(row.ranked_serp_element);
        const serpItem = asRecord(serpElement.serp_item);
        // rank_group（同じドメインの重複を 1 つに数えた順位）を優先し、無ければ rank_absolute
        const rank = numberOrNull(serpItem.rank_group) ?? numberOrNull(serpItem.rank_absolute);
        out.push({
          keyword,
          rank: rank !== null && rank >= 1 ? rank : null,
          monthlyVolume: numberOrNull(info.search_volume),
          url: stringOrNull(serpItem.url),
        });
      }
    }
  }
  return out;
}

export interface FetchRankedKeywordsInput {
  domain: string;
  limit?: number;
  signal?: AbortSignal;
  /** テスト用。既定は global fetch */
  fetchImpl?: typeof fetch;
}

/** ドメイン（`https://` やパスが付いていても受ける）を DataForSEO に渡す形に直す */
export function normalizeTarget(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return "";
  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//, "");
  const host = withoutScheme.split("/")[0]?.split("?")[0] ?? "";
  return host.replace(/^www\./, "");
}

export async function fetchRankedKeywords(input: FetchRankedKeywordsInput): Promise<RankedKeyword[]> {
  if (!dataForSeoCredentials()) {
    throw new SearchEstimateError("DATAFORSEO_LOGIN と DATAFORSEO_PASSWORD が未設定です", "config");
  }
  const target = normalizeTarget(input.domain);
  if (!target) throw new SearchEstimateError("ドメインを指定してください", "config");

  const limit = Math.min(Math.max(input.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const { locationName, languageCode } = localeParams(defaultLocale());
  const body = [
    {
      target,
      location_name: locationName,
      language_code: languageCode,
      limit,
      // 上位から埋めたいので順位の昇順。圏外まで取っても推定には効かない
      order_by: ["ranked_serp_element.serp_item.rank_group,asc"],
    },
  ];

  let res;
  try {
    res = await requestDataForSeo(rankedKeywordsPath(), body, { fetchImpl: input.fetchImpl, signal: input.signal, timeoutMs: TIMEOUT_MS });
  } catch (err) {
    throw new SearchEstimateError(err instanceof DataForSeoNetworkError ? err.message : "DataForSEO に接続できませんでした", "network");
  }

  if (!res.ok) {
    const kind = kindFromHttpStatus(res.status);
    if (kind === "auth") throw new SearchEstimateError("DataForSEO の認証に失敗しました（ログインとパスワードを確認してください）", "auth");
    if (kind === "quota") throw new SearchEstimateError("DataForSEO の残高または回数制限に達しました", "quota");
    throw new SearchEstimateError(`DataForSEO がエラーを返しました（HTTP ${res.status}）`, "upstream");
  }

  const payload = res.payload;
  const rows = parseRankedKeywords(payload);
  if (rows.length === 0) {
    // 認証・残高の失敗が本文で返ったときは種類を付けて返す（2026-09-23。以前は全部 upstream）
    const failed = apiFailure(payload);
    if (failed?.kind === "auth") throw new SearchEstimateError("DataForSEO の認証に失敗しました（ログインとパスワードを確認してください）", "auth");
    if (failed?.kind === "quota") throw new SearchEstimateError("DataForSEO の残高または回数制限に達しました", "quota");
    // 応答は返ったが 1 件も読めない＝パスや項目名が変わった可能性がある。黙って空にしない
    const statusMessage = failed?.message ?? stringOrNull(asRecord(asArray(asRecord(payload).tasks)[0]).status_message);
    throw new SearchEstimateError(
      statusMessage
        ? `キーワードを取得できませんでした（${statusMessage}）`
        : "キーワードを 1 件も取得できませんでした（対象ドメインに順位が無いか、応答の形が変わっています）",
      "upstream",
    );
  }
  return rows;
}
