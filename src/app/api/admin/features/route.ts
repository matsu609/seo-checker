/**
 * POST /api/admin/features
 * 顧客ごとの機能の個別開放を保存する。運用者だけ。
 *
 * 保存先は Clerk の publicMetadata なので、ここでもデータベースは要らない。
 * 送られてきた ID はレジストリに在るものだけに絞る（parseFeatureOverrides）。
 */
import { z } from "zod";
import { toggleClientFeature } from "@/lib/admin/clients";
import { requireAdmin } from "@/lib/admin/guard";
import { parseFeatureOverrides } from "@/lib/plans/overrides";

export const runtime = "nodejs";

const BodySchema = z.object({
  userId: z.string().min(1).max(200),
  featureId: z.string().min(1).max(100),
  enabled: z.boolean(),
});

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "入力が正しくありません。" }, { status: 400 });
  }
  const { userId, featureId, enabled } = parsed.data;

  // 知らない機能 ID は弾く（レジストリに無い値を metadata に残さない）
  if (parseFeatureOverrides([featureId]).length === 0) {
    return Response.json({ error: "その機能はありません。" }, { status: 400 });
  }

  try {
    const overrides = await toggleClientFeature(userId, featureId, enabled);
    return Response.json({ overrides }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "保存できませんでした。" }, { status: 502 });
  }
}
