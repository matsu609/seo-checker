/**
 * API の入口で受け取る「リンク先の URL」の検査。純粋関数（クライアントからも読める）。
 *
 * zod 4 の `z.string().url()` は `javascript:alert(1)` や `data:text/html,…` も「URL」として通す
 * （スキームを見ないため）。口コミの投稿先（writeReviewUrl）は来店客の画面でそのまま開くので、
 * これを通すと他人のブラウザでスクリプトを動かせてしまう（2026-09-23）。**https:// だけ**を受け付ける。
 * 画面側（components/reviews/FormEditor.tsx）もすでに https:// だけを通しているので、それにそろえた。
 */
import { z } from "zod";

/** リンク先の URL の長さの上限（口コミの投稿先と同じ） */
export const LINK_URL_MAX = 500;

/** https:// で始まり、URL として読める（ホスト名がある）か */
export function isHttpsUrl(value: string): boolean {
  if (!/^https:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** zod 用: https:// の URL だけ。message は入力欄に出す文言 */
export function httpsUrlSchema(message = "URL は https:// から入力してください") {
  return z.string().trim().max(LINK_URL_MAX).refine(isHttpsUrl, { message });
}

/**
 * 保存済みの値を来店客に返す前の最後の確認。https:// の URL でなければ null（投稿ボタンを出さない）。
 * 2026-09-23 より前に保存された javascript: などの値が残っていても、公開の画面には渡さない。
 */
export function safeHttpsUrl(value: unknown): string | null {
  return typeof value === "string" && isHttpsUrl(value) ? value : null;
}
