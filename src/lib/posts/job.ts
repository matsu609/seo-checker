/**
 * 予約した投稿の送信（毎日 5:00 JST。日次 Cron の中で最初に動く）。サーバー専用。
 *
 * 予定時刻を過ぎた「予約済み」の投稿を、その利用者が接続した Google アカウントの権限で送る。
 * 失敗は理由つきで「失敗」に変えて知らせる（承認前の 403 もここに残る）。
 *
 * 2026-09-23 に直したこと:
 * - 送る前に「送信中」に変える権利を取り、取れた投稿だけ送る（publish.ts。「今すぐ投稿」との二重投稿を防ぐ）
 * - 1 件の失敗（記録の保存の失敗・お知らせの失敗）で、ほかの利用者の投稿を止めない
 * - プランの対象外の利用者の投稿は「予約済み」のまま残るので、古い順の先頭に溜まり続ける。
 *   以前は 200 件の枠をそれで使い切ると、誰の投稿も送られなくなっていた。対象外と分かった利用者は
 *   除いて読み直す
 */
import { getGoogleTokenForUser } from "@/lib/google/token";
import type { JobContext, JobResult } from "@/lib/jobs/types";
import { notifyUser } from "@/lib/notifications/notify";
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { publishPost, type PublishOutcome } from "./publish";
import { listDuePosts } from "./store";
import { POST_TOPIC_LABELS, type GbpPost } from "./types";

/** 1 回に読む件数 */
export const DUE_BATCH = 200;
/** 読み直す回数の上限（対象外の利用者を除いて読み直す。時間の上限とは別の安全装置） */
export const MAX_ROUNDS = 5;

export interface GbpPostsDeps {
  listDue: (now: Date, limit: number, excludeUserIds: readonly string[]) => Promise<(GbpPost & { userId: string })[]>;
  allows: (userId: string) => Promise<boolean>;
  publish: (userId: string, post: GbpPost, options: { getToken: () => Promise<string>; locations: Map<string, string>; now: Date; dueBy: Date }) => Promise<PublishOutcome>;
  token: (userId: string) => Promise<string>;
  notify: typeof notifyUser;
}

export function defaultGbpPostsDeps(): GbpPostsDeps {
  return {
    listDue: listDuePosts,
    allows: async (userId) => accessAllows(await loadUserAccess(userId), "posts"),
    publish: (userId, post, options) => publishPost(userId, post, { ...options, from: ["scheduled"] }),
    token: (userId) => getGoogleTokenForUser(userId, "business-profile"),
    notify: notifyUser,
  };
}

export async function runGbpPosts(ctx: JobContext, deps: GbpPostsDeps = defaultGbpPostsDeps()): Promise<JobResult> {
  const summary = { due: 0, published: 0, failed: 0, skippedPlan: 0, skippedBusy: 0, errors: 0 };
  let aborted = false;
  const blocked = new Set<string>();
  const seen = new Set<string>();

  for (let round = 0; round < MAX_ROUNDS && !aborted; round++) {
    const batch = (await deps.listDue(ctx.now, DUE_BATCH, [...blocked])).filter((p) => !seen.has(p.id));
    if (batch.length === 0) break;
    for (const p of batch) seen.add(p.id);
    summary.due += batch.length;

    const byUser = new Map<string, typeof batch>();
    for (const p of batch) byUser.set(p.userId, [...(byUser.get(p.userId) ?? []), p]);

    for (const [userId, posts] of byUser) {
      if (ctx.remainingMs() < 15_000) {
        aborted = true;
        break;
      }
      if (blocked.has(userId) || !(await deps.allows(userId))) {
        blocked.add(userId);
        summary.skippedPlan += posts.length;
        continue;
      }
      // トークンはこの利用者の投稿で 1 回だけ取る（失敗も使い回す = 全件が同じ理由で「失敗」になる）
      let token: Promise<string> | null = null;
      const getToken = () => (token ??= deps.token(userId));
      const locations = new Map<string, string>();
      const failures: string[] = [];
      let published = 0;
      for (const post of posts) {
        if (ctx.remainingMs() < 10_000) {
          aborted = true;
          break;
        }
        let outcome: PublishOutcome;
        try {
          outcome = await deps.publish(userId, post, { getToken, locations, now: ctx.now, dueBy: ctx.now });
        } catch (err) {
          // 送る権利を取る前の失敗（データベースに届かない等）。「予約済み」のまま残り、翌日に送り直す
          console.error("[gbp-posts] 送信の準備に失敗（予約済みのまま残す）", { userId, postId: post.id, err });
          summary.errors += 1;
          continue;
        }
        if (outcome.skipped) {
          summary.skippedBusy += 1;
        } else if (outcome.ok) {
          published += 1;
          summary.published += 1;
        } else {
          summary.failed += 1;
          failures.push(`・${POST_TOPIC_LABELS[post.topicType]}「${(post.title || post.summary).slice(0, 30)}」: ${outcome.message}`);
        }
      }
      try {
        if (failures.length > 0) {
          await deps.notify(userId, {
            kind: "post_failed",
            title: `予約した投稿 ${failures.length} 件を送れませんでした`,
            body: `${failures.join("\n")}\n\n投稿の画面で理由を確かめ、直してから「承認して予約」または「今すぐ投稿」を押してください。`,
            link: "/tools/posts",
            channel: "alert",
          });
        }
        if (published > 0) {
          await deps.notify(userId, { kind: "post_published", title: `予約した投稿 ${published} 件を Google に送りました`, body: "Google マップに反映されるまで数分〜数時間かかります。", link: "/tools/posts" });
        }
      } catch (err) {
        console.error("[gbp-posts] お知らせに失敗", { userId, err });
        summary.errors += 1;
      }
    }
  }
  return { summary, aborted };
}
