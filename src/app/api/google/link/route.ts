/**
 * POST /api/google/link
 * 見る対象の Search Console サイトと GA4 プロパティを保存する。
 * 保存先は Clerk の privateMetadata（src/lib/google/settings.ts）。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { googleErrorResponse } from "@/lib/google/errors";
import { setLinkSettings } from "@/lib/google/settings";

export const runtime = "nodejs";

const BodySchema = z.object({
  // null は「選択を解除する」
  searchConsoleSiteUrl: z.string().min(1).max(500).nullable().optional(),
  ga4PropertyId: z.string().regex(/^\d{1,20}$/, "GA4 のプロパティ ID は数字で指定してください").nullable().optional(),
});

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "入力が正しくありません" },
      { status: 400 },
    );
  }
  if (Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "変更する項目がありません" }, { status: 400 });
  }

  try {
    const settings = await setLinkSettings(parsed.data);
    return Response.json({ settings }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
