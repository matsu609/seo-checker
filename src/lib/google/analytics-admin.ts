/**
 * GA4 Admin API v1beta。ユーザーがアクセスできるプロパティの一覧だけを使う。
 * 数値の取得は既存の GA4 Data API クライアント（src/lib/ga4）が担当する。
 */
import { GoogleLinkError, mapGoogleHttpError } from "./errors";
import { getGoogleTokenFor } from "./token";

export const ANALYTICS_ADMIN_ENDPOINT = "https://analyticsadmin.googleapis.com/v1beta";
const TIMEOUT_MS = 30_000;
const LABEL = "Google アナリティクス";

export interface Ga4Property {
  /** 数字だけのプロパティ ID（"properties/123" の 123） */
  propertyId: string;
  /** プロパティ名 */
  displayName: string;
  /** 所属アカウント名（同名プロパティの区別用） */
  accountName: string;
}

export interface AnalyticsAdminOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** テスト用。省略時は Clerk からユーザーのトークンを取る */
  getToken?: () => Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** accountSummaries の応答を解析する（純関数・落ちない） */
export function parseAccountSummaries(payload: unknown): Ga4Property[] {
  const root = isRecord(payload) ? payload : {};
  const summaries = Array.isArray(root.accountSummaries) ? root.accountSummaries : [];
  const out: Ga4Property[] = [];
  for (const account of summaries) {
    if (!isRecord(account)) continue;
    const accountName = typeof account.displayName === "string" ? account.displayName : "";
    const properties = Array.isArray(account.propertySummaries) ? account.propertySummaries : [];
    for (const p of properties) {
      if (!isRecord(p)) continue;
      // "properties/123456789" から数字だけを取る
      const raw = typeof p.property === "string" ? p.property : "";
      const propertyId = raw.split("/").pop() ?? "";
      if (!/^\d+$/.test(propertyId)) continue;
      out.push({
        propertyId,
        displayName: typeof p.displayName === "string" ? p.displayName : propertyId,
        accountName,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.accountName.localeCompare(b.accountName, "ja") ||
      a.displayName.localeCompare(b.displayName, "ja"),
  );
}

/** ユーザーがアクセスできる GA4 プロパティの一覧 */
export async function listGa4Properties(options: AnalyticsAdminOptions = {}): Promise<Ga4Property[]> {
  const endpoint = options.endpoint ?? ANALYTICS_ADMIN_ENDPOINT;
  const fetchImpl = options.fetchImpl ?? fetch;
  const getToken = options.getToken ?? (() => getGoogleTokenFor("analytics"));
  const token = await getToken();

  let res: Response;
  try {
    res = await fetchImpl(`${endpoint}/accountSummaries?pageSize=200`, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new GoogleLinkError(
      timedOut ? `${LABEL} の応答がありませんでした（タイムアウト）` : `${LABEL} に接続できませんでした`,
      "network",
    );
  }
  if (!res.ok) throw mapGoogleHttpError(res.status, LABEL);
  try {
    return parseAccountSummaries(await res.json());
  } catch {
    throw new GoogleLinkError(`${LABEL} の応答を解釈できませんでした`, "network");
  }
}
