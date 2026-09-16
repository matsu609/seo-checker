/**
 * POST /api/admin/clients/agency
 * 登録者の担当代理店を差し替える（agencyId が null なら担当なし）。運用者（マスター）だけ。
 *
 * 代理店画面に誰が並ぶかはこの値だけで決まるので、保存の前に
 * 「その相手が本当に代理店か」をここで確かめる。存在しない ID や、
 * ただの登録者を担当に付けてしまうと、あとから追えない割り当てが残る。
 */
import { z } from "zod";
import { loadAgencies } from "@/lib/admin/agencies";
import { assignClientAgency } from "@/lib/admin/clients";
import { requireAdmin } from "@/lib/admin/guard";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).max(200),
  /** 担当なしにするときは null */
  agencyId: z.string().min(1).max(200).nullable(),
});

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力が正しくありません。" }, { status: 400, headers: NO_STORE });
  }
  const { userId, agencyId } = parsed.data;

  try {
    if (agencyId !== null) {
      const agencies = await loadAgencies();
      if (!agencies.some((a) => a.userId === agencyId)) {
        return Response.json(
          { error: "その代理店は見つかりませんでした。" },
          { status: 400, headers: NO_STORE },
        );
      }
      // 代理店を別の代理店の担当にはしない（画面でも選べないようにしてある）。
      // 許すと代理店どうしで契約情報が見え合う関係ができてしまう
      if (agencies.some((a) => a.userId === userId)) {
        return Response.json(
          { error: "代理店アカウントに担当は付けられません。" },
          { status: 400, headers: NO_STORE },
        );
      }
    }
    const saved = await assignClientAgency(userId, agencyId);
    return Response.json({ agencyId: saved }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存できませんでした。";
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }
}
