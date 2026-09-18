/**
 * 口コミ支援の管理 API（/api/reviews/*）で共通の前処理。サーバー専用。
 *
 * ログインとプラン（機能 ID "reviews"）の確認、所有するアンケートの取得、本文の読み取り。
 * 回答（review_responses）には user_id が無いので、必ず ownedForm で form の所有を確かめてから触る。
 */
import { requireUser } from "@/lib/auth/guard";
import { getForm, type ReviewForm } from "./forms";
export { NO_STORE } from "@/lib/api/headers";

export const FEATURE_ID = "reviews";

import { isUuid } from "@/lib/api/ids";

export { isUuid };


/** 未ログイン / プラン不足なら Response。通れば userId */
export async function requireReviewsUser(): Promise<string | Response> {
  return requireUser({ feature: FEATURE_ID });
}

/** 所有するアンケート。無ければ 404 の Response */
export async function ownedForm(userId: string, id: string): Promise<ReviewForm | Response> {
  if (!isUuid(id)) return Response.json({ error: "アンケートの ID が正しくありません" }, { status: 400 });
  const form = await getForm(userId, id);
  if (!form) return Response.json({ error: "そのアンケートは見つかりません" }, { status: 404 });
  return form;
}

export { badRequest, readJson } from "@/lib/api/request";
