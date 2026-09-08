/**
 * GA4 クライアントの選び方を 1 か所にまとめる。
 *
 * 優先順位:
 *   1. ユーザーが設定画面で連携した GA4 プロパティ（そのユーザーの OAuth トークン）
 *   2. 環境変数のサービスアカウント（全ユーザー共通。従来の動作）
 *
 * 1 が無いときに 2 へ落ちるので、Google 連携を使わない運用のままでも壊れない。
 */
import {
  createGa4Client,
  createGa4ClientWithToken,
  missingGa4EnvVars,
  normalizePropertyId,
  serviceAccountFromEnv,
  type Ga4Client,
} from "@/lib/ga4";
import { getGoogleTokenFor } from "./token";
import { getLinkSettings } from "./settings";

/** どちらの認証で取ったか。画面に「誰のデータか」を出すために使う */
export type Ga4Source = "user" | "env";

export interface ResolvedGa4 {
  client: Ga4Client;
  source: Ga4Source;
}

/**
 * 使える GA4 クライアントを返す。無ければ null。
 *
 * @param requestedPropertyId 呼び出し側が明示したプロパティ（省略時は連携先 → 環境変数の順）
 */
export async function resolveGa4Client(requestedPropertyId?: string): Promise<ResolvedGa4 | null> {
  const settings = await getLinkSettings();
  const requested = requestedPropertyId ? normalizePropertyId(requestedPropertyId) : "";

  // 1. ユーザーが連携している場合は、そのユーザーのトークンで読む。
  //    別のプロパティを指定されても同じトークンで試す（権限が無ければ Google が 403 を返す）
  if (settings.ga4PropertyId) {
    const propertyId = requested || settings.ga4PropertyId;
    return {
      client: createGa4ClientWithToken(propertyId, () => getGoogleTokenFor("analytics")),
      source: "user",
    };
  }

  // 2. 環境変数のサービスアカウント
  const account = serviceAccountFromEnv();
  const envProperty = normalizePropertyId(process.env.GA4_PROPERTY_ID ?? "");
  const propertyId = requested || envProperty;
  if (!account || !propertyId) return null;
  return { client: createGa4Client(propertyId, account), source: "env" };
}

/** GA4 がまったく使えないときに画面へ出す文言 */
export function ga4UnavailableMessage(feature: string): string {
  const missing = missingGa4EnvVars();
  return (
    `${feature}には Google アナリティクスの連携が必要です。` +
    `設定画面で Google アカウントを接続して GA4 プロパティを選ぶか、` +
    `サーバーに ${missing.length > 0 ? missing.join(" と ") : "GA4_PROPERTY_ID と GOOGLE_SERVICE_ACCOUNT_JSON"} を設定してください。`
  );
}
