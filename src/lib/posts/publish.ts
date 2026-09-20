/**
 * 投稿を Google に送る（サーバー専用）。画面の「今すぐ投稿」と日次の定期処理で同じ入口。
 *
 * ビジネス（accounts/…/locations/…）は Place ID で探し、見つかったら控える（次回は探さない）。
 * 承認前・権限なしは GoogleLinkError（403 の案内）になり、投稿は「失敗」として理由が残る。
 */
import { createLocalPost, listAllLocations, type BusinessProfileOptions } from "@/lib/google/business-profile";
import { GoogleLinkError } from "@/lib/google/errors";
import { validatePost } from "./schedule";
import { updatePost } from "./store";
import type { GbpPost } from "./types";

export interface PublishOutcome {
  post: GbpPost;
  ok: boolean;
  message: string;
}

export async function publishPost(userId: string, post: GbpPost, options: BusinessProfileOptions & { locations?: Map<string, string>; now?: Date } = {}): Promise<PublishOutcome> {
  const now = options.now ?? new Date();
  const errors = validatePost(post);
  if (errors.length > 0) {
    const failed = (await updatePost(userId, post.id, { status: "failed", error: errors.join("。") }, now)) ?? post;
    return { post: failed, ok: false, message: errors.join("。") };
  }
  try {
    let locationName = post.locationName;
    if (!locationName) {
      locationName = options.locations?.get(post.placeId) ?? null;
      if (!locationName) {
        const found = (await listAllLocations(options)).find((l) => l.placeId === post.placeId) ?? null;
        locationName = found?.name ?? null;
        if (found && options.locations) options.locations.set(post.placeId, found.name);
      }
      if (!locationName) {
        const message = "接続した Google アカウントの中に、この店舗のビジネス プロフィールが見つかりませんでした。その店舗の管理者アカウントで接続し直してください。";
        const failed = (await updatePost(userId, post.id, { status: "failed", error: message }, now)) ?? post;
        return { post: failed, ok: false, message };
      }
    }
    const result = await createLocalPost(locationName, post, options);
    const published = (await updatePost(userId, post.id, { status: "published", locationName, publishedAt: now.toISOString(), googleName: result.name, error: null }, now)) ?? post;
    return { post: published, ok: true, message: "投稿しました。Google マップに反映されるまで数分〜数時間かかります。" };
  } catch (err) {
    const message = err instanceof GoogleLinkError ? err.message : "Google への投稿に失敗しました。時間をおいて再度お試しください。";
    if (!(err instanceof GoogleLinkError)) console.error("[posts] 投稿に失敗", err);
    const failed = (await updatePost(userId, post.id, { status: "failed", error: message }, now)) ?? post;
    return { post: failed, ok: false, message };
  }
}
