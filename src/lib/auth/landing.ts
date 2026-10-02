/**
 * ログイン直後・登録直後に着く画面（/start が振り分ける）。
 *
 *   管理アカウント    → /clients（顧客管理。運用者と同じ画面）
 *   未契約（free）    → /plans（料金プラン = カード登録。利用者の決定 2026-10-02。登録 → すぐカード登録 → ツール）
 *   契約済み          → 最初のツール
 *
 * 無料診断（/ と /meo）はここでは行き先にしない。お客様のアカウントでは使わず、
 * 専用ログイン（/free/login。src/lib/free/access.ts）の人だけが使う。
 */
export const FIRST_TOOL_PATH = "/tools/seo-analysis";
/** 顧客管理（運用者・管理アカウントが開く）。旧 /agency はここへ転送 */
export const MANAGER_PATH = "/clients";
/** 料金プラン（未契約の人が登録・ログインの直後に着く。ここでカード登録） */
export const PLANS_LANDING_PATH = "/plans";
/** 登録・ログイン直後の振り分け（画面は出さない） */
export const START_PATH = "/start";
/** 登録フォーム（6 項目）と、登録情報が足りない人の補完フォーム */
export const SIGN_UP_PATH = "/sign-up";
/** ログイン画面（管理アカウントの案内など、外に渡す URL を組み立てるのに使う） */
export const SIGN_IN_PATH = "/sign-in";
export const LEAD_PROFILE_PATH = "/sign-up/profile";
