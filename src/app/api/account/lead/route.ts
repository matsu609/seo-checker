/**
 * /api/account/lead … 登録情報（担当者名・会社名・電話・店舗の種類・所在地・地域）。ログイン必須。
 *
 *   GET  → { lead }  いまの登録情報（無ければ null）。設定画面と各ツールの初期値に使う
 *   POST → { lead }  保存
 *
 * 登録フォームは Clerk の unsafeMetadata に載せるので通常は POST を通らない。
 * Google でログインして登録情報が無い人の補完フォームと、設定画面で直すときに使う。
 * 保存先は publicMetadata.lead（サーバーだけが書ける。他のキーは触らない）。
 */
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { NO_STORE } from "@/lib/api/headers";
import { requireAuth } from "@/lib/auth/guard";
import { isAuthEnabled } from "@/lib/auth/config";
import { LEAD_KEY, leadFromMetadata, LeadProfileSchema } from "@/lib/free/lead";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  // Clerk が無い開発環境では登録情報そのものが無い
  if (!isAuthEnabled()) return Response.json({ lead: null }, { headers: NO_STORE });
  const user = await currentUser();
  if (!user) return Response.json({ error: "ログインが必要です" }, { status: 401, headers: NO_STORE });
  return Response.json({ lead: leadFromMetadata(user.publicMetadata, user.unsafeMetadata) }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = LeadProfileSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { publicMetadata: { [LEAD_KEY]: parsed.data } });
  return Response.json({ lead: parsed.data }, { headers: NO_STORE });
}
