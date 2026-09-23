/**
 * POST /api/admin/impersonate
 * お客様の画面をそのまま見るための URL（Clerk の代理ログイン用チケット）を返す。
 * 運用者・管理アカウントとも全登録者に（相手が管理アカウントなら 404。運用者のアカウントには
 * admin/impersonate.ts の canImpersonate が断る）。
 *
 * 応答: { url, email }。画面はこの URL に遷移する。遷移するとお客様としてログインした状態になり、
 * 画面の下に「代理ログイン中」の帯が出る（src/components/shell/ImpersonationBanner.tsx）。
 */
import { z } from "zod";
import { requireClientAccess, requireClientScope } from "@/lib/admin/guard";
import { createImpersonationUrl } from "@/lib/admin/impersonate";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";

const BodySchema = z.object({ userId: z.string().min(1).max(200) });


export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）。
  // 本文より先に立場を見る（権限の無い人に 400 を返すと API の存在を教えてしまう。2026-09-23）
  const scope = await requireClientScope();
  if (scope instanceof Response) return scope;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力が正しくありません。" }, { status: 400, headers: NO_STORE });
  }

  const denied = await requireClientAccess(parsed.data.userId, scope);
  if (denied) return denied;

  try {
    const { url, email } = await createImpersonationUrl(parsed.data.userId);
    return Response.json({ url, email }, { headers: NO_STORE });
  } catch (err) {
    // 断る理由（運用者どうし・自分自身）はそのまま出す。運用者・管理アカウントしか見ない画面なので隠さない
    const message = err instanceof Error ? err.message : "代理ログインを開始できませんでした。";
    console.error("[impersonate] 開始に失敗", err);
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }
}
