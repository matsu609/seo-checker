/**
 * GET /api/replies/status … 口コミ返信画面の状態（ログイン必須）。
 *
 * - Google 連携の有無と、口コミ返信の権限（business.manage）があるか
 * - 権限があれば Google ビジネス プロフィールのビジネス一覧（無ければ理由）
 * - 接続前の代替として、MEO に登録済みの自社店舗（公開情報の口コミで返信案を作る）
 * - AI が使えるか
 */
import { isAuthEnabled } from "@/lib/auth/config";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { listAllLocations, type BpLocation } from "@/lib/google/business-profile";
import { GoogleLinkError } from "@/lib/google/errors";
import { canUse } from "@/lib/google/scopes";
import { getGoogleConnection } from "@/lib/google/token";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { listStores } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface RepliesStoreOption {
  placeId: string;
  name: string;
}

export interface RepliesStatusResponse {
  /** Clerk が無い環境（開発）では Google 連携そのものが使えない */
  authEnabled: boolean;
  connected: boolean;
  email: string | null;
  /** business.manage が許可されているか */
  hasScope: boolean;
  locations: BpLocation[];
  /** ビジネス一覧を取れなかった理由（API 未承認など） */
  locationsError: string | null;
  stores: RepliesStoreOption[];
  aiEnabled: boolean;
}

export async function GET() {
  const denied = await requireAuth({ feature: "replies" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });

  const body: RepliesStatusResponse = {
    authEnabled: isAuthEnabled(),
    connected: false,
    email: null,
    hasScope: false,
    locations: [],
    locationsError: null,
    stores: [],
    aiEnabled: isAnthropicEnabled(),
  };

  try {
    body.stores = (await listStores(userId)).filter((s) => s.role === "own").map((s) => ({ placeId: s.placeId, name: s.name }));
  } catch {
    // Supabase 未設定・テーブル無しでも画面は出す
  }

  if (body.authEnabled) {
    const connection = await getGoogleConnection();
    body.connected = connection.connected;
    body.email = connection.email ?? null;
    body.hasScope = connection.connected && canUse(connection.scopes, "business-profile");
    if (body.hasScope) {
      try {
        body.locations = await listAllLocations();
        if (body.locations.length === 0) body.locationsError = "接続した Google アカウントが管理しているビジネスが見つかりませんでした。";
      } catch (err) {
        body.locationsError = err instanceof GoogleLinkError ? err.message : "ビジネス一覧を取得できませんでした。";
      }
    }
  }
  return Response.json(body, { headers: { "cache-control": "no-store" } });
}
