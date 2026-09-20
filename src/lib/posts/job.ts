/**
 * 予約した投稿の送信（毎日 5:00 JST。日次 Cron の中で最初に動く）。サーバー専用。
 *
 * 予定時刻を過ぎた「予約済み」の投稿を、その利用者が接続した Google アカウントの権限で送る。
 * 失敗は理由つきで「失敗」に変えて知らせる（承認前の 403 もここに残る）。
 */
import { getGoogleTokenForUser } from "@/lib/google/token";
import { GoogleLinkError } from "@/lib/google/errors";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { publishPost } from "./publish";
import { listDuePosts, updatePost } from "./store";
import { POST_TOPIC_LABELS } from "./types";

export async function runGbpPosts(ctx: JobContext): Promise<JobResult> {
  const due = await listDuePosts(ctx.now);
  const summary = { due: due.length, published: 0, failed: 0, skippedPlan: 0 };
  let aborted = false;
  const byUser = new Map<string, typeof due>();
  for (const p of due) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);

  for (const [userId, posts] of byUser) {
    if (ctx.remainingMs() < 15_000) {
      aborted = true;
      break;
    }
    const access = await loadUserAccess(userId);
    if (!accessAllows(access, "posts")) {
      summary.skippedPlan += posts.length;
      continue;
    }
    const locations = new Map<string, string>();
    const failures: string[] = [];
    let published = 0;
    for (const post of posts) {
      if (ctx.remainingMs() < 10_000) {
        aborted = true;
        break;
      }
      let outcome;
      try {
        outcome = await publishPost(userId, post, { getToken: () => getGoogleTokenForUser(userId, "business-profile"), locations, now: ctx.now });
      } catch (err) {
        const message = err instanceof GoogleLinkError ? err.message : "投稿に失敗しました";
        await updatePost(userId, post.id, { status: "failed", error: message }, ctx.now);
        outcome = { post, ok: false, message };
      }
      if (outcome.ok) {
        published += 1;
        summary.published += 1;
      } else {
        summary.failed += 1;
        failures.push(`・${POST_TOPIC_LABELS[post.topicType]}「${(post.title || post.summary).slice(0, 30)}」: ${outcome.message}`);
      }
    }
    if (failures.length > 0) {
      await notifyUser(userId, {
        kind: "post_failed",
        title: `予約した投稿 ${failures.length} 件を送れませんでした`,
        body: `${failures.join("\n")}\n\n投稿の画面で理由を確かめ、直してから「承認して予約」または「今すぐ投稿」を押してください。`,
        link: "/tools/posts",
        channel: "alert",
      });
    }
    if (published > 0) {
      await notifyUser(userId, { kind: "post_published", title: `予約した投稿 ${published} 件を Google に送りました`, body: "Google マップに反映されるまで数分〜数時間かかります。", link: "/tools/posts" });
    }
  }
  return { summary, aborted };
}
