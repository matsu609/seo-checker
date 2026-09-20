/**
 * POST /api/admin/promo
 * 顧客の割引（スタンダード専用の 10 パターン）を設定・解除する。
 * 運用者（マスター）は全員に、管理アカウントは担当の登録者だけ（担当外は 404）。
 * 本文: { userId, pattern: "off10" … | null }。応答: { promo: パターン名 | null }。
 *
 * 保存先は顧客の Clerk publicMetadata.promo。データベースは要らない。
 */
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { assignClientPromo } from "@/lib/admin/clients";
import { requireClientAccess } from "@/lib/admin/guard";
import { patternById } from "@/lib/billing/promo";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).max(200),
  pattern: z.string().min(1).max(40).nullable(),
});


export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "入力が正しくありません。" }, { status: 400, headers: NO_STORE });
  const { userId, pattern } = parsed.data;
  if (pattern !== null && !patternById(pattern)) return Response.json({ error: "その割引はありません。" }, { status: 400, headers: NO_STORE });

  const denied = await requireClientAccess(userId);
  if (denied) return denied;

  try {
    const { userId: by } = await auth();
    // 金額に関わる操作なので、誰が設定したかを必ず残す
    const promo = await assignClientPromo(userId, pattern, by ?? "admin");
    return Response.json({ promo }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存できませんでした。";
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }
}
