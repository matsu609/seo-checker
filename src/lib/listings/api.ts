/**
 * 基本情報掲載の API（/api/listings/*）で共通の前処理。サーバー専用。
 * ログインとプラン（機能 ID "listings"）の確認、本文の読み取り。
 */
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";

export const FEATURE_ID = "listings";
export const NO_STORE = { "cache-control": "no-store" } as const;
export const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

/** 未ログイン / プラン不足なら Response。通れば userId */
export async function requireListingsUser(): Promise<string | Response> {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: FEATURE_ID });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  return userId;
}

export async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
}

export function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}
