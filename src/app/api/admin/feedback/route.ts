/**
 * /api/admin/feedback … ご意見・不具合の報告の一覧と対応（顧客管理の画面から。ほかは 404）。
 *
 *   GET   ?status=open|in_progress|done → { items }  新しい順、最大 300 件。status を省くと全部
 *   PATCH { id, status?, reply? }        → { item }   対応状態と返答を更新
 *
 * 見える範囲は立場で変える（利用者の決定 2026-09-20）。
 *   運用者（マスター）   … 全員分
 *   管理アカウント       … 担当に付いている登録者の分だけ（他人の報告は一覧にも出ず、更新もできない）
 *
 * 返答は利用者の設定画面の「ご意見の履歴」に出る（メールは送らない）。
 */
import { z } from "zod";
import { NO_STORE } from "@/lib/api/headers";
import { UUID_RE } from "@/lib/api/ids";
import { listAgencyClientIds } from "@/lib/admin/agencies";
import { currentClientScope, requireClientAccess } from "@/lib/admin/guard";
import { dbErrorResponse } from "@/lib/db/supabase";
import { getFeedback, listAllFeedback, listFeedbackForUsers, updateFeedback } from "@/lib/feedback/store";
import { FEEDBACK_STATUSES, FeedbackUpdateSchema } from "@/lib/feedback/types";

export const runtime = "nodejs";
export const maxDuration = 15;

const QuerySchema = z.object({ status: z.enum(FEEDBACK_STATUSES).optional() });
const PatchSchema = z.object({ id: z.string().regex(UUID_RE) }).and(FeedbackUpdateSchema);

const notFound = () => Response.json({ error: "見つかりませんでした。" }, { status: 404, headers: NO_STORE });

export async function GET(request: Request) {
  const scope = await currentClientScope();
  if (!scope) return notFound();
  const url = new URL(request.url);
  const query = QuerySchema.safeParse({ status: url.searchParams.get("status") ?? undefined });
  if (!query.success) return Response.json({ error: "状態の指定が正しくありません" }, { status: 400, headers: NO_STORE });
  try {
    const items =
      scope.kind === "master"
        ? await listAllFeedback(query.data.status)
        : await listFeedbackForUsers(await listAgencyClientIds(scope.agencyId), query.data.status);
    return Response.json({ items }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function PATCH(request: Request) {
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }
  const { id, ...patch } = parsed.data;
  try {
    // 誰の報告かを先に見て、その人に触れる立場かを確かめる（担当外は 404）
    const current = await getFeedback(id);
    if (!current) return notFound();
    const denied = await requireClientAccess(current.userId);
    if (denied) return denied;

    const item = await updateFeedback(id, patch);
    if (!item) return Response.json({ error: "その記録は見つかりません" }, { status: 404, headers: NO_STORE });
    return Response.json({ item }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
