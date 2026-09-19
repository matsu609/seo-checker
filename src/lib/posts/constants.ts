/**
 * ビジネス プロフィールへの投稿で、画面とサーバーの両方が使う定数。
 * business-profile.ts はサーバー専用（Clerk のトークンを読む）なので、ここに分ける。
 */

/** Google の上限（1 投稿の本文） */
export const LOCAL_POST_SUMMARY_MAX = 1_500;

/** 画面で勧める長さ。Google は長文をたたんで表示するので、読まれるのは最初の 2〜3 行 */
export const LOCAL_POST_SUMMARY_RECOMMENDED = 300;

/** 「今回のネタ」の上限（AI に渡す材料。画面の入力欄と API の検証で使う） */
export const TOPIC_MAX = 400;

/** 1 回で取る投稿の件数 */
export const LOCAL_POSTS_PAGE_SIZE = 20;

/**
 * 投稿に付けるボタン。
 * CALL はビジネス プロフィールの電話番号を使うので URL を送らない（送ると Google が弾く）。
 */
export const LOCAL_POST_ACTIONS = ["LEARN_MORE", "BOOK", "ORDER", "SHOP", "SIGN_UP", "CALL"] as const;
export type LocalPostAction = (typeof LOCAL_POST_ACTIONS)[number];

export const LOCAL_POST_ACTION_LABELS: Record<LocalPostAction, string> = {
  LEARN_MORE: "詳細",
  BOOK: "予約",
  ORDER: "オンライン注文",
  SHOP: "購入",
  SIGN_UP: "登録",
  CALL: "今すぐ電話",
};

/** CALL 以外はリンク先の URL が要る */
export function actionNeedsUrl(action: LocalPostAction): boolean {
  return action !== "CALL";
}

/** Google が返す投稿の状態 */
export const LOCAL_POST_STATE_LABELS: Record<string, string> = {
  LIVE: "掲載中",
  PROCESSING: "処理中",
  REJECTED: "非承認",
};
