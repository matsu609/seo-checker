/**
 * POST /api/account/lead … 登録情報（担当者名・会社名・電話・店舗の種類）を保存する（ログイン必須）。
 *
 * 登録フォームは Clerk の unsafeMetadata に載せるので通常はここを通らない。
 * Google でログインして登録情報が無い人の補完フォームと、あとから直すときに使う。
 * 保存先は publicMetadata.lead（サーバーだけが書ける。他のキーは触らない）。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/guard";
import { LEAD_KEY, LeadProfileSchema } from "@/lib/free/lead";

export const runtime = "nodejs";

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
  return Response.json({ lead: parsed.data }, { headers: { "cache-control": "no-store" } });
}
