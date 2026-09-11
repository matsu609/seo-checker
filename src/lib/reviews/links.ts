/**
 * Google マップの口コミ投稿画面の URL を決める。サーバー専用。
 *
 * 指定があればそれ → Place ID があれば、保存済みの MEO 報告書の `links.writeReview`（r28 で取得）
 * → 無ければ Place ID から組み立て → どれも無ければ null（来店客の画面に投稿ボタンが出ない）。
 */
import { latestReports } from "@/lib/maps/history";
import { writeReviewUrlFor } from "./forms";

export async function resolveWriteReviewUrl(userId: string, placeId: string | null, given: string | null): Promise<string | null> {
  if (given) return given;
  if (!placeId) return null;
  try {
    const entry = (await latestReports(userId, [placeId])).get(placeId);
    const link = entry?.report.detail.links?.writeReview;
    if (link) return link;
  } catch {
    // 報告書が無い・テーブルが無い → 組み立てる
  }
  return writeReviewUrlFor(placeId);
}
