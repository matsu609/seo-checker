/**
 * GET /free/<トークン> … 無料診断の専用リンク（利用者の決定 2026-10-02。パスワード無し）。
 * トークンが合えば署名付き Cookie（30 日）を置いて無料診断（`/`）へ送る。合わなければ 404（存在を教えない）。
 * リンクの総当たりを遅らせるため、IP ごとに 10 分で 20 回まで。
 *
 * 転送先は**相対パス**（`Location: /`）で返す。`new URL("/", request.url)` だと request.url のホストが
 * 実際に開かれたホスト（app.seo-checker.tokyo）ではなくサーバー自身の名前になり、別のホストに飛ばされて
 * 置いたばかりの Cookie が届かず、ログイン画面に着いていた（利用者の報告 2026-10-02）。
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
  const res = new NextResponse(null, { status: 302, headers: { location: FREE_PATHS.site, "cache-control": "no-store" } });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
