/**
 * 無料診断の「固定リンク」と Cookie の純粋な部分（利用者の決定 2026-10-03「リンクも固定で。ばれたら終わりでいい」）。
 *
 * 無料診断（`/` と `/meo`）はお客様のアカウントでは使わない。パスワードも、推測できないトークンも無い。
 * 固定の入口 `/free` を開いた人に印の Cookie（30 日）を置き、以後は `/` と `/meo` を直接開ける。
 * Cookie は「入口を通った」印でしかない（誰でも `/free` を開けるので署名しても意味が無い）。
 * 守りは月の回数上限（monthly.ts）だけ。
 *
 * ここは環境変数も next/headers も読まない（クライアントからも import できる）。
 */

/** Cookie の名前 */
export const FREE_SESSION_COOKIE = "free_diagnosis";
/** Cookie の値（印なので固定） */
export const FREE_SESSION_VALUE = "1";
/** 有効期限（日）。配ったリンクを毎回開き直さなくて済む長さにする */
export const FREE_SESSION_DAYS = 30;
/** 固定リンクのパス（営業・代理店に渡す。routes.ts の公開範囲と一致させる） */
export const FREE_ENTRY_PATH = "/free";
/** 入れないときの API のエラーコード（Cookie が無い・切れた） */
export const FREE_ACCESS_CODE = "free_link";
/** 今月の上限に達したときの API のエラーコード */
export const FREE_MONTHLY_CODE = "free_monthly";

/** 今から FREE_SESSION_DAYS 日後 */
export function freeSessionExpiry(now: number = Date.now()): number {
  return now + FREE_SESSION_DAYS * 24 * 60 * 60 * 1000;
}

/** Cookie の値が印か */
export function isFreeSessionValue(value: string | undefined | null): boolean {
  return value === FREE_SESSION_VALUE;
}
