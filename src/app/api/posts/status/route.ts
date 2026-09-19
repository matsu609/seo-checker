/**
 * GET /api/posts/status … 投稿画面の状態（ログイン必須）。
 *
 * - Google 連携の有無と、投稿の権限（business.manage。口コミ返信と同じスコープ）があるか
 * - 権限があれば Google ビジネス プロフィールのビジネス一覧（無ければ理由）
 * - 掲載タブで決めた基本情報（店名・業種・説明文）を AI の下書きの材料にする
 * - AI が使えるか
 */
import { isAuthEnabled } from "@/lib/auth/config";
import { requireUser } from "@/lib/auth/guard";
import { listAllLocations, type BpLocation } from "@/lib/google/business-profile";
import { GoogleLinkError } from "@/lib/google/errors";
import { canUse } from "@/lib/google/scopes";
import { getGoogleConnection } from "@/lib/google/token";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { getListing } from "@/lib/listings/store";
import { listStores } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface PostsStoreOption {
  placeId: string;
  name: string;
  /** 掲載タブで決めた業種・説明文（AI の下書きの材料。無ければ空） */
  category: string;
  description: string;
}

export interface PostsStatusResponse {
  /** Clerk が無い環境（開発）では Google 連携そのものが使えない */
  authEnabled: boolean;
  connected: boolean;
  email: string | null;
  /** business.manage が許可されているか */
  hasScope: boolean;
  locations: BpLocation[];
  /** ビジネス一覧を取れなかった理由（API 未承認など） */
  locationsError: string | null;
  stores: PostsStoreOption[];
  aiEnabled: boolean;
}

export async function GET() {
  const userId = await requireUser({ feature: "posts" });
  if (userId instanceof Response) return userId;

  const body: PostsStatusResponse = {
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
    const own = (await listStores(userId)).filter((s) => s.role === "own");
    body.stores = await Promise.all(
      own.map(async (s) => {
        const record = await getListing(userId, s.placeId).catch(() => null);
        return {
          placeId: s.placeId,
          name: s.name,
          category: record?.profile.category ?? "",
          description: record?.profile.longDescription || record?.profile.shortDescription || "",
        };
      }),
    );
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
