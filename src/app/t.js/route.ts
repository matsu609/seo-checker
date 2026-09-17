/**
 * GET /t.js — 自前の計測タグの本体だったもの。取り下げ済み（利用者の決定 2026-09-17:
 * お客様がタグを貼る作業が要る = ツール内で完結しないので提供しない）。
 * 貼られたままのサイトがあっても何も起きないよう、空のスクリプトを返す。
 */
export const runtime = "nodejs";

export function GET() {
  return new Response("/* SEO Checker: this tag is retired and does nothing. */\n", {
    status: 410,
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=86400" },
  });
}
