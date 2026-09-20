/**
 * ログイン直後・登録直後に着く画面（/start が振り分ける）。
 *
 *   管理アカウント    → /clients（顧客管理。運用者と同じ画面）
 *   未契約（free）    → 無料診断（/）。登録した人はまず無料診断を 2 回まで使える（利用者の決定 2026-09-18）
 *   契約済み          → 最初のツール。契約済みの人には無料診断を見せない（利用者の決定 2026-09-13）
 */
export const FIRST_TOOL_PATH = "/tools/seo-analysis";
/** 顧客管理（運用者・管理アカウントが開く）。旧 /agency はここへ転送 */
export const MANAGER_PATH = "/clients";
export const FREE_HOME_PATH = "/";
/** 登録フォーム（6 項目）と、登録情報が足りない人の補完フォーム */
export const SIGN_UP_PATH = "/sign-up";
export const LEAD_PROFILE_PATH = "/sign-up/profile";
