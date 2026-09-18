/**
 * 基本情報掲載の API（/api/listings/*）で共通の前処理。サーバー専用。
 * ログインとプラン（機能 ID "listings"）の確認、本文の読み取り。
 */
import { requireUser } from "@/lib/auth/guard";
export { NO_STORE } from "@/lib/api/headers";

export const FEATURE_ID = "listings";
export const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

/** 未ログイン / プラン不足なら Response。通れば userId */
export async function requireListingsUser(): Promise<string | Response> {
  return requireUser({ feature: FEATURE_ID });
}

export { badRequest, readJson } from "@/lib/api/request";
