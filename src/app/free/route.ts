/**
 * GET /free … 無料診断の固定リンク（利用者の決定 2026-10-03「リンクも固定で。ばれたら終わりでいい」）。
 * 誰が開いても印の Cookie（30 日）を置いて無料診断（`/`）へ送る。パスワードもトークンも無い。
 * 守りは月の回数上限（src/lib/free/monthly.ts）だけ。
 *
 * 転送先は**相対パス**（`Location: /`）で返す。`new URL("/", request.url)` だと request.url のホストが
 * 実際に開かれたホストではなくサーバー自身の名前になり、別のホストに飛ばされて置いたばかりの Cookie が届かない
 * （利用者の報告 2026-10-02）。
 */
import { NextResponse } from "next/server";
import { freeSessionCookie } from "@/lib/free/access";
import { FREE_PATHS } from "@/lib/free/upsell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const res = new NextResponse(null, { status: 302, headers: { location: FREE_PATHS.site, "cache-control": "no-store" } });
  const cookie = freeSessionCookie();
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
