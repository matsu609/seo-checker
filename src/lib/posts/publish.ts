/**
 * 投稿を Google に送る（サーバー専用）。画面の「今すぐ投稿」と日次の定期処理で同じ入口。
 *
 * ビジネス（accounts/…/locations/…）は Place ID で探し、見つかったら控える（次回は探さない）。
 * 承認前・権限なしは GoogleLinkError（403 の案内）になり、投稿は「失敗」として理由が残る。
 *
 * 二重投稿を防ぐ決まり（2026-09-23）:
 *   1. 送る前に claimPost で「送信中」に変える。変えられなかった（別の処理が先に取った）ら何もしない
 *   2. Google に送れたあとで記録の保存に失敗しても「失敗」には戻さない（戻すと次に押したときに 2 回目が出る）。
 *      投稿は「送信中」のまま残り、定期処理も拾わない
 *   3. 送る権利を取ったあとは例外を投げない（定期処理が 1 件の失敗でほかの利用者の投稿まで止めないように）
 */
import { createLocalPost, findLocationByPlaceId, type BusinessProfileOptions } from "@/lib/google/business-profile";
import { GoogleLinkError } from "@/lib/google/errors";
import { validatePost } from "./schedule";
import { claimPost, updatePost } from "./store";
import type { GbpPost, PostStatus } from "./types";

export interface PublishOutcome {
  post: GbpPost;
  ok: boolean;
  message: string;
  /** 別の処理が先に送信を始めていた（または状態が変わっていた）ので、何もしなかった */
  skipped?: boolean;
}

export interface PublishOptions extends BusinessProfileOptions {
  /** Place ID → ビジネス名の控え（定期処理が利用者ごとに使い回す） */
  locations?: Map<string, string>;
  now?: Date;
  /** 送ってよい元の状態。既定は「今すぐ投稿」（投稿済み・送信中以外） */
  from?: readonly PostStatus[];
  /** 予定時刻がこれより前のものだけ送る（定期処理。予約を後ろにずらされた投稿を送らない） */
  dueBy?: Date;
}

/** 「今すぐ投稿」で送ってよい状態 */
export const MANUAL_PUBLISH_FROM: readonly PostStatus[] = ["draft", "scheduled", "failed", "cancelled"];

export const PUBLISHED_MESSAGE = "投稿しました。Google マップに反映されるまで数分〜数時間かかります。";
export const ALREADY_CLAIMED_MESSAGE = "この投稿はすでに送信中か、送信済みです。画面を開き直して状態を確かめてください。";

export async function publishPost(userId: string, post: GbpPost, options: PublishOptions = {}): Promise<PublishOutcome> {
  const now = options.now ?? new Date();
  const claimed = await claimPost(userId, post.id, options.from ?? MANUAL_PUBLISH_FROM, now, options.dueBy);
  if (!claimed) return { post, ok: false, skipped: true, message: ALREADY_CLAIMED_MESSAGE };

  // 送る内容は権利を取った時点のもの（読んでから取るまでの間に編集されていても、その内容で送る）
  const target = claimed;
  const fail = async (message: string): Promise<PublishOutcome> => {
    let failed: GbpPost | null = null;
    try {
      failed = await updatePost(userId, target.id, { status: "failed", error: message }, now);
    } catch (err) {
      // 記録できなくても「送信中」のまま残るだけ（送ってはいないので二重にはならない）
      console.error("[posts] 失敗の記録に失敗", { postId: target.id, err });
    }
    return { post: failed ?? { ...target, status: "failed", error: message }, ok: false, message };
  };

  const errors = validatePost(target);
  if (errors.length > 0) return fail(errors.join("。"));

  let locationName = target.locationName;
  let result: { name: string | null; searchUrl: string | null };
  try {
    if (!locationName) {
      locationName = options.locations?.get(target.placeId) ?? null;
      if (!locationName) {
        const found = await findLocationByPlaceId(target.placeId, options);
        locationName = found?.name ?? null;
        if (found && options.locations) options.locations.set(target.placeId, found.name);
      }
      if (!locationName) {
        return fail("接続した Google アカウントの中に、この店舗のビジネス プロフィールが見つかりませんでした。その店舗の管理者アカウントで接続し直してください。");
      }
    }
    result = await createLocalPost(locationName, target, options);
  } catch (err) {
    if (!(err instanceof GoogleLinkError)) console.error("[posts] 投稿に失敗", err);
    return fail(err instanceof GoogleLinkError ? err.message : "Google への投稿に失敗しました。時間をおいて再度お試しください。");
  }

  // ここから先は Google に出ている。記録に失敗しても「失敗」に戻さない（上の決まり 2）
  const publishedAt = now.toISOString();
  const patch = { status: "published" as const, locationName, publishedAt, googleName: result.name, error: null };
  let published: GbpPost | null = null;
  try {
    published = await updatePost(userId, target.id, patch, now);
  } catch (err) {
    console.error("[posts] Google には投稿できたが記録の保存に失敗（送信中のまま残し、再送しない）", { postId: target.id, googleName: result.name, err });
  }
  return { post: published ?? { ...target, ...patch }, ok: true, message: PUBLISHED_MESSAGE };
}
