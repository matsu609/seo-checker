/**
 * PATCH / DELETE /api/posts/[id]
 *   PATCH { ...PostInput の一部, action?: "schedule" | "draft" | "cancel" }
 *     schedule = 承認して予約（検査に通らなければ 400）、draft = 下書きに戻す、cancel = 取り消し
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, isUuid, NO_STORE, PostInputSchema, readJson, requirePostsUser } from "@/lib/posts/api";
import { validatePost } from "@/lib/posts/schedule";
import { deletePost, getPost, updatePost, type PostPatch } from "@/lib/posts/store";

export const runtime = "nodejs";
export const maxDuration = 30;

type Context = { params: Promise<{ id: string }> };

const PatchSchema = PostInputSchema.partial().extend({ action: z.enum(["schedule", "draft", "cancel"]).optional() });

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
