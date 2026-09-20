/**
 * POST /api/posts/[id]/publish … いますぐ Google に投稿する（ログイン中の本人の Google 権限で）。
 */
import { NextRequest } from "next/server";
import { dbErrorResponse } from "@/lib/db/supabase";
import { googleErrorResponse } from "@/lib/google/errors";
import { badRequest, isUuid, NO_STORE, requirePostsUser } from "@/lib/posts/api";
import { publishPost } from "@/lib/posts/publish";
import { getPost } from "@/lib/posts/store";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Context) {
  const userId = await requirePostsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  if (!isUuid(id)) return badRequest("ID が不正です");
  try {
    const post = await getPost(userId, id);
    if (!post) return Response.json({ error: "投稿が見つかりません" }, { status: 404, headers: NO_STORE });
    if (post.status === "published") return badRequest("すでに投稿済みです");
    const outcome = await publishPost(userId, post);
    return Response.json(outcome, { status: outcome.ok ? 200 : 502, headers: NO_STORE });
  } catch (err) {
    if (err instanceof Error && err.name === "GoogleLinkError") return googleErrorResponse(err);
    return dbErrorResponse(err);
  }
}
