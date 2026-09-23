/**
 * PATCH / DELETE /api/posts/[id]
 *   PATCH { ...PostInput の一部, action?: "schedule" | "draft" | "cancel" }
 *     schedule = 承認して予約（検査に通らなければ 400）、draft = 下書きに戻す、cancel = 取り消し
 *     送られてきた項目だけを書き換える（送られなかった項目は保存済みのまま）
 *
 * 代理ログイン中は、Google に出ることになる変更（予約する・予約済みの投稿の中身を変える）を 403 で塞ぐ。
 * 定期処理が後でお客様の名前で送ってしまうため。下書きの編集・下書きに戻す・取り消しは塞がない。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { blockGoogleWriteWhileImpersonating } from "@/lib/google/write-guard";
import { badRequest, isUuid, NO_STORE, PostPatchInputSchema, readJson, requirePostsUser } from "@/lib/posts/api";
import { validatePost } from "@/lib/posts/schedule";
import { deletePost, getPost, updatePost, type PostPatch } from "@/lib/posts/store";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

// 既定値の無い編集用スキーマ（PostInputSchema.partial() は既定値で保存済みの内容を消していた。2026-09-23）
const PatchSchema = PostPatchInputSchema.extend({ action: z.enum(["schedule", "draft", "cancel"]).optional() });

export async function PATCH(request: NextRequest, context: Context) {
  const userId = await requirePostsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("ID が不正です");
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { action, ...input } = parsed.data;
  try {
    const current = await getPost(userId, id);
    if (!current) return Response.json({ error: "投稿が見つかりません" }, { status: 404, headers: NO_STORE });
    if (current.status === "published") return badRequest("投稿済みのものは編集できません");
    // 送信中は中身を変えられない（送る内容は送る権利を取った時点で決まっている）。取り消し・下書きに戻すだけ受ける
    if (current.status === "publishing" && action !== "cancel" && action !== "draft") {
      return Response.json({ error: "送信中の投稿は編集できません。しばらくしてから画面を開き直してください。" }, { status: 409, headers: NO_STORE });
    }
    const changesContent = Object.keys(input).length > 0;
    if (action === "schedule" || (action === undefined && current.status === "scheduled" && changesContent)) {
      const blocked = await blockGoogleWriteWhileImpersonating("投稿の予約");
      if (blocked) return blocked;
    }
    const merged = { ...current, ...input };
    const patch: PostPatch = { ...input };
    if (action === "schedule") {
      const errors = validatePost(merged);
      if (!merged.scheduledAt) errors.push("予約日時を入力してください");
      if (errors.length > 0) return badRequest(errors.join("。"));
      patch.status = "scheduled";
      patch.error = null;
    } else if (action === "draft") {
      patch.status = "draft";
    } else if (action === "cancel") {
      patch.status = "cancelled";
    }
    const post = await updatePost(userId, id, patch);
    return Response.json({ post }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const userId = await requirePostsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("ID が不正です");
  try {
    await deletePost(userId, id);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
