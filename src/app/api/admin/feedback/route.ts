/**
 * /api/admin/feedback … ご意見・不具合の報告の一覧と対応（**運用者 = マスターだけ**。ほかは 404）。
 *
 *   GET   ?status=open|in_progress|done → { items }  新しい順、最大 300 件。status を省くと全部
 *   PATCH { id, status?, reply? }        → { item }   対応状態と返答を更新
 *
 * 画面は /admin/feedback（サイドバーの「マスターアカウント用」）。
 * 2026-09-21 の利用者の決定で、返答は運用者だけが行う（管理アカウントには見せない）。
 *
 * 返答は利用者の設定画面の「ご意見の履歴」に出る（メールは送らない）。
 */
import { z } from "zod";
import { NO_STORE } from "@/lib/api/headers";
import { UUID_RE } from "@/lib/api/ids";
import { requireAdmin } from "@/lib/admin/guard";
import { dbErrorResponse } from "@/lib/db/supabase";
import { listAllFeedback, updateFeedback } from "@/lib/feedback/store";
import { FEEDBACK_STATUSES, FeedbackUpdateSchema } from "@/lib/feedback/types";

export const runtime = "nodejs";
export const maxDuration = 15;

const QuerySchema = z.object({ status: z.enum(FEEDBACK_STATUSES).optional() });
const PatchSchema = z.object({ id: z.string().regex(UUID_RE) }).and(FeedbackUpdateSchema);

export async function GET(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const url = new URL(request.url);
  const query = QuerySchema.safeParse({ status: url.searchParams.get("status") ?? undefined });
  if (!query.success) return Response.json({ error: "状態の指定が正しくありません" }, { status: 400, headers: NO_STORE });
  try {
    return Response.json({ items: await listAllFeedback(query.data.status) }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  const { id, ...patch } = parsed.data;
  try {
    const item = await updateFeedback(id, patch);
    if (!item) return Response.json({ error: "その記録は見つかりません" }, { status: 404, headers: NO_STORE });
    return Response.json({ item }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
