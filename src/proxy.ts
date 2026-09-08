/**
 * ログインの入口（Next.js 16 の proxy。旧 middleware.ts から改名された）。
 *
 * src/lib/auth/routes.ts の判定で保護対象のパスだけ Clerk に通す。
 * 無料診断（/ と /api/analyze・/api/site・/api/faq）は見込み顧客の入口なので
 * 未ログインでも通す。
 *
 * Clerk のキーが未設定なら素通りさせる。開発と E2E ではキーを置かないため、
 * ここで落とすとダミーサイトでのスモークが動かなくなる。未設定のまま本番に
 * 出したときは warnIfAuthDisabled() が起動ログに警告を出す。
 */
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextMiddleware, type NextRequest } from "next/server";
import { isAuthEnabled, warnIfAuthDisabled } from "@/lib/auth/config";
import { isApiPath, isProtectedPath, unauthorizedResponse } from "@/lib/auth/routes";

// clerkMiddleware() はキーが無いと構築時に失敗しうるので、
// 認証が有効なときだけ作って使い回す
let handler: NextMiddleware | null = null;

function getHandler(): NextMiddleware {
  handler ??= clerkMiddleware(async (auth, request) => {
    const { pathname } = request.nextUrl;
    if (!isProtectedPath(pathname)) return;

    const { userId, redirectToSignIn } = await auth();
    if (userId) return;

    // 画面はサインインへ送る。API は 401 の JSON を返す。
    // ここでリダイレクトを返すと、ブラウザの fetch が Clerk のホスト画面まで
    // 追いかけて HTML を受け取ってしまい、呼び出し側がエラーを表示できない。
    if (isApiPath(pathname)) return unauthorizedResponse();
    return redirectToSignIn();
  });
  return handler;
}

export function proxy(request: NextRequest, event: NextFetchEvent) {
  if (!isAuthEnabled()) {
    warnIfAuthDisabled();
    return NextResponse.next();
  }
  return getHandler()(request, event);
}

export const config = {
  matcher: [
    // 静的ファイルと画像最適化は除く。除かないと CSS や画像まで
    // サインインへリダイレクトされて画面が壊れる
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|woff2?|ttf|otf|eot|txt|xml|webmanifest)$).*)",
    // API は必ず通す（上のパターンから漏れないように明示する）
    "/api/(.*)",
  ],
};
