/**
 * 代理店アカウントの追加・解除。運用者（マスター）だけ。
 *
 *   POST   /api/admin/agencies  { email }  … 追加（登録済みなら role を付与、未登録なら招待）
 *   DELETE /api/admin/agencies  { userId } … 解除（role を外す）
 *
 * 保存先は Clerk の publicMetadata なので、ここでもデータベースは要らない。
 */
import { z } from "zod";
import { addAgencyByEmail, loadAgencies, removeAgency } from "@/lib/admin/agencies";
import { requireAdmin } from "@/lib/admin/guard";
import { normalizeEmail } from "@/lib/admin/roles";

export const runtime = "nodejs";

const AddSchema = z.object({ email: z.string().min(3).max(320) });
const RemoveSchema = z.object({ userId: z.string().min(1).max(200) });

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  const email = parsed.success ? normalizeEmail(parsed.data.email) : null;
  if (!email) {
    return Response.json(
      { error: "メールアドレスの形が正しくありません。" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await addAgencyByEmail(email);
    const agencies = await loadAgencies();
    return Response.json({ result, agencies }, { headers: NO_STORE });
  } catch (err) {
    // 運用者のアドレスを弾いた場合は理由をそのまま返す（運用者しか見ない画面なので隠さない）
    const message = err instanceof Error ? err.message : "追加できませんでした。";
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = RemoveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力が正しくありません。" }, { status: 400, headers: NO_STORE });
  }

  try {
    await removeAgency(parsed.data.userId);
    const agencies = await loadAgencies();
    return Response.json({ agencies }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "解除できませんでした。";
    return Response.json({ error: message }, { status: 502, headers: NO_STORE });
  }
}
