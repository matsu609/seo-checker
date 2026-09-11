/**
 * 口コミ支援の管理 API（/api/reviews/*）で共通の前処理。サーバー専用。
 *
 * ログインとプラン（機能 ID "reviews"）の確認、所有するアンケートの取得、本文の読み取り。
 * 回答（review_responses）には user_id が無いので、必ず ownedForm で form の所有を確かめてから触る。
 */
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { getForm, type ReviewForm } from "./forms";

export const FEATURE_ID = "reviews";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

export const NO_STORE = { "cache-control": "no-store" } as const;

/** 未ログイン / プラン不足なら Response。通れば userId */
export async function requireReviewsUser(): Promise<string | Response> {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: FEATURE_ID });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  return userId;
}

/** 所有するアンケート。無ければ 404 の Response */
export async function ownedForm(userId: string, id: string): Promise<ReviewForm | Response> {
  if (!isUuid(id)) return Response.json({ error: "アンケートの ID が正しくありません" }, { status: 400 });
  const form = await getForm(userId, id);
  if (!form) return Response.json({ error: "そのアンケートは見つかりません" }, { status: 404 });
  return form;
}

/** JSON 本文。読めなければ 400 の Response */
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
