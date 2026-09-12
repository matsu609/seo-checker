/**
 * 切り出し版だけが持つ設定。無料診断の画面から「本体サービス」（有料プラン・登録）へ
 * 送るときの URL。末尾のスラッシュは落とす。
 */
const raw = process.env.NEXT_PUBLIC_MAIN_APP_URL?.trim() || "https://app.seo-checker.tokyo";

export const MAIN_APP_URL = raw.replace(/\/+$/, "");
