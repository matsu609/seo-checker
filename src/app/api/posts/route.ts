/**
 * /api/posts … Google ビジネス プロフィールへの投稿（最新情報）。ログイン必須。
 *
 * GET    ?locationName=…[&pageToken=…] → { posts, nextPageToken }
 * POST   { locationName, summary, action?, url?, photoUrl? } → { post }
 * DELETE { postName }
 *
 * 投稿は口コミ返信と同じ business.manage スコープで送れる（My Business v4）。
 * Business Profile API の利用申請（#5）が承認されるまでは 403 になり、
 * business-profile.ts の 403 の案内がそのまま画面に出る。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { createLocalPost, deleteLocalPost, isLocalPostName, isLocationName, listLocalPosts, type BpLocalPost } from "@/lib/google/business-profile";
import { googleErrorResponse } from "@/lib/google/errors";
import { LOCAL_POST_ACTIONS, LOCAL_POST_SUMMARY_MAX, actionNeedsUrl } from "@/lib/posts/constants";

export const runtime = "nodejs";
export const maxDuration = 30;

const PHOTO_URL_MAX = 500;

const CreateSchema = z
  .object({
    locationName: z.string().refine(isLocationName, "ビジネスの指定が正しくありません"),
    summary: z.string().trim().min(1, "投稿の本文を入力してください").max(LOCAL_POST_SUMMARY_MAX, `投稿は ${LOCAL_POST_SUMMARY_MAX} 文字までです`),
    action: z.enum(LOCAL_POST_ACTIONS).nullable().default(null),
    url: z.string().trim().max(PHOTO_URL_MAX).default(""),
    photoUrl: z.string().trim().max(PHOTO_URL_MAX).default(""),
  })
  // 「詳細」「予約」などは押したときの行き先が要る（CALL だけは電話番号を使うので URL 無し）
  .refine((v) => !v.action || !actionNeedsUrl(v.action) || v.url.length > 0, {
    message: "ボタンを付けるときはリンク先の URL を入力してください",
    path: ["url"],
  })
  .refine((v) => !v.url || /^https:\/\//.test(v.url), { message: "リンク先は https:// で始まる URL を入力してください", path: ["url"] })
  .refine((v) => !v.photoUrl || /^https:\/\//.test(v.photoUrl), { message: "写真は https:// で始まる URL を入力してください", path: ["photoUrl"] });

const DeleteSchema = z.object({
  postName: z.string().refine(isLocalPostName, "投稿の指定が正しくありません"),
});

export interface PostsListResponse {
  posts: BpLocalPost[];
  nextPageToken: string | null;
}

export interface PostsCreateResponse {
  post: BpLocalPost | null;
}

async function readJson(request: Request): Promise<unknown | Response> {
  try {
    return await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
}

const NO_STORE = { "cache-control": "no-store" } as const;

export async function GET(request: Request) {
  const denied = await requireAuth({ feature: "posts" });
  if (denied) return denied;
  const url = new URL(request.url);
  const locationName = url.searchParams.get("locationName") ?? "";
  if (!isLocationName(locationName)) return Response.json({ error: "ビジネスの指定が正しくありません" }, { status: 400 });
  try {
    const page = await listLocalPosts(locationName, url.searchParams.get("pageToken"));
    const body: PostsListResponse = page;
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return googleErrorResponse(err);
  }
}

export async function POST(request: Request) {
  const denied = await requireAuth({ feature: "posts" });
  if (denied) return denied;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  const d = parsed.data;
  try {
    const post = await createLocalPost(d.locationName, {
      summary: d.summary,
      cta: d.action ? { actionType: d.action, url: d.url } : null,
      photoUrl: d.photoUrl,
    });
    const body: PostsCreateResponse = { post };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return googleErrorResponse(err);
  }
}

export async function DELETE(request: Request) {
  const denied = await requireAuth({ feature: "posts" });
  if (denied) return denied;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = DeleteSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  try {
    await deleteLocalPost(parsed.data.postName);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
