/**
 * GET /free … 運用者（ADMIN_EMAILS）が Clerk でログイン中に開く無料診断の入口（サイドバー「管理者用」から）。
 * トークンを控えなくても、ログインしていれば Cookie を置いて `/` へ送る。運用者でなければ 404。
 * 営業・代理店に渡すのはこれではなく、マスター画面に出る専用リンク（`/free/<トークン>`）。
 */
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/guard";
import { freeSessionCookie, isFreeOpenWithoutLogin } from "@/lib/free/access";
import { FREE_PATHS } from "@/lib/free/upsell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const res = NextResponse.redirect(new URL(FREE_PATHS.site, request.url), { status: 302 });
  res.headers.set("cache-control", "no-store");
  if (isFreeOpenWithoutLogin()) return res;
  if (!(await isAdmin())) return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
  const cookie = await freeSessionCookie();
  if (!cookie) return new Response("Not Found", { status: 404, headers: { "cache-control": "no-store" } });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
