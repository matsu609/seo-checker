"use client";

/**
 * 無料診断の API が 401（専用ログインが要る）を返したら、ログイン画面へ送る。
 * Cookie の期限切れ（30 日）や、別のブラウザで開いたときの受け皿。
 */
import { FREE_LOGIN_CODE, FREE_LOGIN_PATH } from "@/lib/free/session-rules";

/** いまの画面に戻れるようにしてログイン画面へ */
export function redirectToFreeLogin(): void {
  const back = `${window.location.pathname}${window.location.search}`;
  // 画面ごと移る（サーバーが Cookie を見て振り分けるので、クライアント側の遷移ではなく再読み込み）
  window.location.href = `${FREE_LOGIN_PATH}?redirect_url=${encodeURIComponent(back)}`;
}

/** 応答が「専用ログインが要る」の 401 ならログイン画面へ送って true を返す（呼び出し側はエラー表示をしない） */
export async function redirectIfFreeLoginRequired(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  let code: unknown = null;
  try {
    code = ((await res.clone().json()) as { code?: unknown }).code;
  } catch {
    // JSON でなければ無料診断の 401 ではない
  }
  if (code !== FREE_LOGIN_CODE) return false;
  redirectToFreeLogin();
  return true;
}
