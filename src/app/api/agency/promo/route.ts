/**
 * POST /api/agency/promo
 * 代理店が、担当している登録者の割引（スタンダード専用の 10 パターン）を設定・解除する。
 * 本文: { userId, pattern: "off10" … | null }。応答: { promo: パターン名 | null }。
 *
 * 代理店の ID は必ずログイン中のユーザーから取る（currentAgencyId）。相手がその代理店の担当でなければ
 * 404（他の代理店の登録者の存在を教えない）。金額に関わる操作なので、設定した人の ID を残す。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { assignClientPromo } from "@/lib/admin/clients";
import { currentAgencyId } from "@/lib/admin/guard";
import { agencyIdFromMetadata, isAgencyMetadata } from "@/lib/admin/roles";
import { patternById } from "@/lib/billing/promo";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).max(200),
  pattern: z.string().min(1).max(40).nullable(),
});

const NO_STORE = { "cache-control": "no-store" } as const;
const notFound = () => Response.json({ error: "見つかりませんでした。" }, { status: 404, headers: NO_STORE });

export async function POST(request: Request) {
  const agencyId = await currentAgencyId();
  if (!agencyId) return notFound();

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "入力が正しくありません。" }, { status: 400, headers: NO_STORE });
  const { userId, pattern } = parsed.data;
  if (pattern !== null && !patternById(pattern)) return Response.json({ error: "その割引はありません。" }, { status: 400, headers: NO_STORE });

  try {
    const client = await clerkClient();
    const target = await client.users.getUser(userId).catch(() => null);
    // 担当の登録者だけ。代理店アカウントそのものにも付けない
    if (!target || agencyIdFromMetadata(target.publicMetadata) !== agencyId || isAgencyMetadata(target.publicMetadata)) return notFound();
    const { userId: by } = await auth();
    const promo = await assignClientPromo(userId, pattern, by ?? agencyId);
    return Response.json({ promo }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存できませんでした。";
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }
}
