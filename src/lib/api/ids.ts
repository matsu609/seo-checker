/**
 * API の入口で使う ID の形の検査。
 *
 * Supabase の主キーは UUID v4 で、形が違う値をそのまま問い合わせに載せると
 * PostgREST 側で型エラーになり 500 相当の応答になってしまう。ルートの入口で 400 に落とす。
 *
 * 2026-09-18 まで、まったく同じ正規表現が 7 か所（ルート 6 本 + reviews/api.ts）に重複していた。
 */

/** UUID v4 の形（zod の `.regex()` に渡す用）。判定だけなら `isUuid` を使う */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID の形か（大文字小文字は区別しない） */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
