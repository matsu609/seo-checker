/**
 * GET /api/replies/reviews?location=accounts/…/locations/…&pageToken=… … 口コミの一覧（ログイン必須）。
 * Google ビジネス プロフィールから新しい順に最大 50 件。続きは nextPageToken で。
 */
import { requireAuth } from "@/lib/auth/guard";
import { isLocationName, listReviews, type BpReviewsPage } from "@/lib/google/business-profile";
import { googleErrorResponse } from "@/lib/google/errors";

export const runtime = "nodejs";
export const maxDuration = 30;

export type RepliesReviewsResponse = BpReviewsPage;

export async function GET(request: Request) {
  const denied = await requireAuth({ feature: "replies" });
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const location = params.get("location") ?? "";
  if (!isLocationName(location)) return Response.json({ error: "ビジネスの指定が正しくありません" }, { status: 400 });
  const pageToken = params.get("pageToken") || null;
  if (pageToken && pageToken.length > 500) return Response.json({ error: "ページの指定が正しくありません" }, { status: 400 });
  try {
    const body: RepliesReviewsResponse = await listReviews(location, pageToken);
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
