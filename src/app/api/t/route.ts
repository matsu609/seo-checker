/**
 * POST /api/t — 計測タグ（/t.js）からのイベントを受ける収集口。ログイン不要。
 *
 * 守り: サイト ID の実在確認（10 分キャッシュ）、1 回 20 件まで、IP ごとの回数制限、クローラの UA は捨てる。
 * 保存するのはパス・参照元ホスト・UTM・端末種別だけで、IP と UA は訪問者 ID のハッシュにしか使わない
 * （src/lib/analytics/visitor.ts）。応答は常に 204（タグ側でエラーを扱わない）。
 *
 * 本文は text/plain の JSON（sendBeacon / fetch keepalive）。CORS のプリフライトが起きないので、
 * OPTIONS は念のためだけに置く。
 */
import { NextRequest } from "next/server";
import { isBotUserAgent } from "@/lib/analytics/bot";
import { CollectBodySchema, toRows } from "@/lib/analytics/collect";
import { insertEvents, siteExists } from "@/lib/analytics/store";
import { jstDay } from "@/lib/analytics/visitor";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { clientKeyOf, takeClientToken, type WindowLimit } from "@/lib/free/ratelimit";

export const runtime = "nodejs";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type",
  "cache-control": "no-store",
};

/** 同じ IP から 1 分に 120 回まで（1 人が 1 ページで送るのは数件） */
const PER_MINUTE: WindowLimit = { windowMs: 60 * 1000, limit: 120 };
const BODY_MAX = 16 * 1024;

function done(status = 204): Response {
  return new Response(null, { status, headers: CORS });
}

export function OPTIONS() {
  return done(204);
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return done(204);
  const ua = request.headers.get("user-agent");
  if (isBotUserAgent(ua)) return done(204);
  const ip = clientKeyOf(request);
  if (!takeClientToken("tracking", ip, PER_MINUTE)) return done(429);

  let text: string;
  try {
    text = await request.text();
  } catch {
    return done(400);
  }
  if (text.length > BODY_MAX) return done(413);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return done(400);
  }
  const parsed = CollectBodySchema.safeParse(raw);
  if (!parsed.success) return done(400);

  try {
    if (!(await siteExists(parsed.data.site))) return done(204);
    await insertEvents(toRows(parsed.data, { day: jstDay(), ip, userAgent: ua ?? "" }));
  } catch (err) {
    // 保存に失敗してもタグ側には何もさせない（お客様のサイトの表示に影響させない）
    console.error("[tracking] 保存に失敗", err instanceof Error ? err.message : err);
  }
  return done(204);
}
