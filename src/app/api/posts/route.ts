/**
 * /api/posts … Google ビジネス プロフィールの投稿。ログイン必須（スタンダード）。
 *
 *   GET  ?placeId=  → { enabled, stores, google, aiEnabled, posts, nextRunAt }
 *   POST { placeId, ...PostInput } → 手で 1 本作る（scheduledAt があれば予約済み、無ければ下書き）
 *        代理ログイン中の予約は 403（定期処理がお客様の名前で Google に送るため。下書きは作れる）
 */
import { z } from "zod";
import { isAuthEnabled } from "@/lib/auth/config";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { canUse } from "@/lib/google/scopes";
import { blockGoogleWriteWhileImpersonating } from "@/lib/google/write-guard";
import { getGoogleConnection } from "@/lib/google/token";
import { scheduleOf } from "@/lib/jobs/schedule";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { listStores } from "@/lib/maps/stores";
import { badRequest, NO_STORE, PLACE_ID, PostInputSchema, readJson, requirePostsUser } from "@/lib/posts/api";
import { validatePost } from "@/lib/posts/schedule";
import { insertPosts, listPosts } from "@/lib/posts/store";
import type { GbpPost } from "@/lib/posts/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface PostsResponse {
  enabled: boolean;
  stores: { placeId: string; name: string }[];
  google: { authEnabled: boolean; connected: boolean; hasScope: boolean; email: string | null };
  aiEnabled: boolean;
  posts: GbpPost[];
  nextRunAt: string;
}

export async function GET(request: Request) {
  const userId = await requirePostsUser();
  if (userId instanceof Response) return userId;
  const placeId = new URL(request.url).searchParams.get("placeId");
  if (placeId !== null && !PLACE_ID.test(placeId)) return badRequest("店舗の ID が正しくありません");
  const body: PostsResponse = {
    enabled: isSupabaseConfigured(),
    stores: [],
    google: { authEnabled: isAuthEnabled(), connected: false, hasScope: false, email: null },
    aiEnabled: isAnthropicEnabled(),
    posts: [],
    nextRunAt: scheduleOf("gbp-posts").next(new Date()).toISOString(),
  };
  if (!body.enabled) return Response.json(body, { headers: NO_STORE });
  try {
    body.stores = (await listStores(userId)).filter((s) => s.role === "own").map((s) => ({ placeId: s.placeId, name: s.name }));
    body.posts = await listPosts(userId, placeId ?? undefined);
  } catch (err) {
    return dbErrorResponse(err);
  }
  if (body.google.authEnabled) {
    const conn = await getGoogleConnection();
    body.google = { authEnabled: true, connected: conn.connected, hasScope: conn.connected && canUse(conn.scopes, "business-profile"), email: conn.email ?? null };
  }
  return Response.json(body, { headers: NO_STORE });
}

const CreateSchema = PostInputSchema.extend({ placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません") });

export async function POST(request: Request) {
  const userId = await requirePostsUser();
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "投稿の保存には Supabase の設定が必要です", code: "not_configured" }, { status: 503, headers: NO_STORE });
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { placeId, ...input } = parsed.data;
  if (input.scheduledAt) {
    const blocked = await blockGoogleWriteWhileImpersonating("投稿の予約");
    if (blocked) return blocked;
  }
  try {
    const own = (await listStores(userId)).some((s) => s.role === "own" && s.placeId === placeId);
    if (!own) return Response.json({ error: "その店舗は MEO の自社店舗に登録されていません" }, { status: 404, headers: NO_STORE });
    if (input.scheduledAt) {
      const errors = validatePost(input);
      if (errors.length > 0) return badRequest(errors.join("。"));
    }
    const [post] = await insertPosts(userId, placeId, [{ ...input, status: input.scheduledAt ? "scheduled" : "draft" }]);
    return Response.json({ post }, { status: 201, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
