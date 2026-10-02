/**
 * GET /free/<トークン> … 無料診断の専用リンク（利用者の決定 2026-10-02。パスワード無し）。
 * トークンが合えば署名付き Cookie（30 日）を置いて無料診断（`/`）へ送る。合わなければ 404（存在を教えない）。
 * リンクの総当たりを遅らせるため、IP ごとに 10 分で 20 回まで。
 */
import { NextResponse } from "next/server";
import { freeSessionCookie, isValidFreeToken } from "@/lib/free/access";
import { clientKeyOf, takeClientToken } from "@/lib/free/ratelimit";
import { FREE_PATHS } from "@/lib/free/upsell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LINK_LIMIT = { windowMs: 10 * 60 * 1000, limit: 20 } as const;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!takeClientToken("free-link", clientKeyOf(request), LINK_LIMIT)) {
    return new Response("しばらく待ってからお試しください。", { status: 429, headers: { "Retry-After": "600", "cache-control": "no-store" } });
  }
  const { token } = await params;
  if (!(await isValidFreeToken(token))) return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
  const cookie = await freeSessionCookie();
  if (!cookie) return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
  const res = NextResponse.redirect(new URL(FREE_PATHS.site, request.url), { status: 302 });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  res.headers.set("cache-control", "no-store");
  return res;
}
