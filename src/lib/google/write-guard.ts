/**
 * 代理ログイン中に、お客様の名前で Google に書き込ませない。サーバー専用。
 *
 * 代理ログインは「見るための機能で、代わりに操作するための機能ではない」（docs/dev/ARCHITECTURE.md・
 * src/lib/admin/impersonate.ts）。Google への書き込み（口コミへの返信の投稿・削除、投稿の送信と予約、
 * 基本情報の送信）は Google 上でお客様の操作として公開され、取り消しても見た人の記憶や通知は戻らない。
 * 2026-09-23 まで決済の API だけが塞がれていて、これらは代理中でも動いていた。
 *
 * 下書き・読み取り・予約の取り消しは塞がない（見るための確認作業で使うため）。
 */
import { isImpersonating } from "@/lib/admin/impersonate";
import { NO_STORE } from "@/lib/api/headers";
import { isAuthEnabled } from "@/lib/auth/config";

/**
 * 代理中なら 403 の Response、そうでなければ null。
 * `action` は「口コミへの返信」のような、塞いだ操作の名前（エラー文に入る）。
 */
export async function blockGoogleWriteWhileImpersonating(action: string): Promise<Response | null> {
  // ログインが無い環境（開発・E2E）では auth() が例外になるので、先に見る
  if (!isAuthEnabled() || !(await isImpersonating())) return null;
  return Response.json(
    {
      error: `代理ログイン中は${action}ができません。画面の確認だけを行い、操作が必要な場合はお客様ご自身に行っていただいてください。`,
      code: "impersonating",
    },
    { status: 403, headers: NO_STORE },
  );
}
