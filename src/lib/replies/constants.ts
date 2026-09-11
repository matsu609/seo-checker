/**
 * 口コミ返信の上限（クライアントでも読める純粋な定数）。
 * サーバー専用のモジュール（Business Profile クライアント・AI）を画面から import しないための置き場。
 */

/** 返信の最大文字数（Google の上限は 4,096 文字。画面では短めに縛る） */
export const REPLY_MAX = 1_500;
/** AI 返信案の最大文字数 */
export const REPLY_DRAFT_MAX = 1_000;
export const OWNER_NOTE_MAX = 500;
export const SIGNATURE_MAX = 60;
