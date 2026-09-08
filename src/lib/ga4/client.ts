/**
 * GA4 Data API v1beta の runReport クライアント。
 *
 * エンドポイントは固定（ユーザー入力の URL ではないので assertPublicHost の対象外）。
 * プロパティ ID とサービスアカウント JSON はサーバーの環境変数からだけ読む。
 *
 * 応答は「行が無い」「metricValues が足りない」ことが普通にあるので、
 * parseRunReport は例外を投げずに欠けた値を空文字として埋める。
 */
import { getAccessToken, serviceAccountFromEnv, type TokenFetchOptions } from "./auth";
import {
  Ga4Error,
  type Ga4Client,
  type Ga4Report,
  type Ga4Row,
  type Ga4RunReportBody,
  type ServiceAccount,
} from "./types";

export const GA4_DATA_ENDPOINT = "https://analyticsdata.googleapis.com/v1beta";
const REPORT_TIMEOUT_MS = 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringsOf(value: unknown, key: "value" | "name"): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => {
    if (typeof v === "string") return v;
    if (isRecord(v) && typeof v[key] === "string") return v[key];
    return "";
  });
}

/**
 * runReport の応答 → 使う形。行や値が欠けていても落ちない（純関数）。
 */
export function parseRunReport(payload: unknown): Ga4Report {
  const root = isRecord(payload) ? payload : {};
  const dimensionHeaders = stringsOf(root.dimensionHeaders, "name");
  const metricHeaders = stringsOf(root.metricHeaders, "name");
  const rawRows = Array.isArray(root.rows) ? root.rows : [];
  const rows: Ga4Row[] = [];
  for (const raw of rawRows) {
    if (!isRecord(raw)) continue;
    rows.push({
      dimensionValues: stringsOf(raw.dimensionValues, "value"),
      metricValues: stringsOf(raw.metricValues, "value"),
    });
  }
  const rowCount = typeof root.rowCount === "number" ? root.rowCount : rows.length;
  return { dimensionHeaders, metricHeaders, rows, rowCount };
}

/** GA4 の文字列メトリクス → 数値。欠損・非数値は 0 */
export function metricNumber(row: Ga4Row | undefined, index: number): number {
  const raw = row?.metricValues[index];
  if (typeof raw !== "string" || raw === "") return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/** GA4 のディメンション値。欠損は空文字 */
export function dimensionValue(row: Ga4Row | undefined, index: number): string {
  const raw = row?.dimensionValues[index];
  return typeof raw === "string" ? raw : "";
}

/** ヘッダー名から列位置を引く（メトリクスの並び順に依存しないため） */
export function headerIndex(headers: readonly string[], name: string): number {
  return headers.indexOf(name);
}

/**
 * 上流のステータス → 日本語メッセージ。docs の指定どおりの文言にする。
 */
export function mapGa4HttpError(status: number, detail?: string): Ga4Error {
  if (status === 401 || status === 403) {
    return new Ga4Error("サービスアカウントに GA4 プロパティの閲覧権限がありません", "auth", status);
  }
  if (status === 404) {
    return new Ga4Error("プロパティ ID が見つかりません", "not_found", status);
  }
  if (status === 429) {
    return new Ga4Error("API の上限に達しました", "rate_limit", status);
  }
  return new Ga4Error(
    `GA4 のデータを取得できませんでした（HTTP ${status}）${detail ? `: ${detail}` : ""}`,
    "upstream",
    status,
  );
}

/** 応答本文からエラーの説明を拾う（無ければ空） */
function errorDetail(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const error = payload.error;
  if (isRecord(error) && typeof error.message === "string") return error.message;
  return "";
}

/** GA4 のプロパティ ID は数字だけ（"properties/123" と書かれていても受ける） */
export function normalizePropertyId(raw: string): string {
  return raw.trim().replace(/^properties\//, "").trim();
}

export interface Ga4ClientOptions extends TokenFetchOptions {
  endpoint?: string;
}

/**
 * アクセストークンの取り方だけを差し替えられる形。
 *
 * 環境変数のサービスアカウント（全体共通）と、ログイン中のユーザーが Google
 * 連携で許可した OAuth トークン（ユーザーごと）のどちらでも同じ経路を使う。
 */
export function createGa4ClientWithToken(
  propertyId: string,
  getToken: () => Promise<string>,
  options: Ga4ClientOptions = {},
): Ga4Client {
  const id = normalizePropertyId(propertyId);
  const endpoint = options.endpoint ?? GA4_DATA_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    propertyId: id,
    async runReport(body: Ga4RunReportBody): Promise<Ga4Report> {
      if (!id) throw new Ga4Error("GA4 のプロパティが指定されていません", "config");
      const token = await getToken();
      let res: Response;
      try {
        res = await fetchImpl(`${endpoint}/properties/${encodeURIComponent(id)}:runReport`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(options.timeoutMs ?? REPORT_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch {
        throw new Ga4Error("GA4 Data API に接続できませんでした", "upstream");
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      if (!res.ok) throw mapGa4HttpError(res.status, errorDetail(json));
      return parseRunReport(json);
    },
  };
}

/** サービスアカウント（環境変数）で認証する GA4 クライアント */
export function createGa4Client(
  propertyId: string,
  account: ServiceAccount,
  options: Ga4ClientOptions = {},
): Ga4Client {
  return createGa4ClientWithToken(propertyId, () => getAccessToken(account, options), options);
}

/** GA4 が使えるか（GA4_PROPERTY_ID と GOOGLE_SERVICE_ACCOUNT_JSON の両方） */
export function isGa4Enabled(): boolean {
  return Boolean(process.env.GA4_PROPERTY_ID?.trim() && process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
}

/**
 * 環境変数からクライアントを作る。未設定なら null を返し、
 * 呼び出し側（Route Handler）は 503 と足りない環境変数名を返す。
 * サービスアカウント JSON が壊れているときだけ Ga4Error（config）を投げる。
 */
export function getGa4Client(options: Ga4ClientOptions = {}): Ga4Client | null {
  const propertyId = process.env.GA4_PROPERTY_ID?.trim();
  if (!propertyId) return null;
  const account = serviceAccountFromEnv();
  if (!account) return null;
  return createGa4Client(propertyId, account, options);
}

/** 未設定の環境変数名（503 のメッセージに出す） */
export function missingGa4EnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.GA4_PROPERTY_ID?.trim()) missing.push("GA4_PROPERTY_ID");
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim()) missing.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  return missing;
}
