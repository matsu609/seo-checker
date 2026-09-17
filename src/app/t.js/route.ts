/**
 * GET /t.js — お客様のサイトに貼る計測タグ本体。ログイン不要（src/lib/auth/routes.ts の公開ページ）。
 * 中身は src/lib/analytics/script.ts。1 時間キャッシュ（変えたら 1 時間で全サイトに行き渡る）。
 */
import { TRACKING_SCRIPT } from "@/lib/analytics/script";

export const runtime = "nodejs";

export function GET() {
  return new Response(TRACKING_SCRIPT, {
    status: 200,
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
