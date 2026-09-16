/**
 * 代理ログイン（運用者がお客様の画面をそのまま見る）。サーバー専用。
 *
 * 仕組みは Clerk の Actor Token。運用者を actor、お客様を本人とする短命のチケットを作り、
 * その URL を開くとお客様としてログインした状態になる。セッションには「誰が代理でログインしたか」
 * （`actor.sub`）が残るので、画面側で常に代理中であることを出せる（ImpersonationBanner）。
 *
 * **画面を見るための機能で、お客様の代わりに操作するための機能ではない。**
 * 実費の出る操作や決済の操作は、代理中は動かさない（お金に関わる事故は取り返しがつかないため）。
 * `isImpersonating()` を決済の API で見て塞いでいる。
 *
 * 気をつけていること:
 * - 入れるのは運用者（ADMIN_EMAILS）だけ。requireAdmin() を通してから呼ぶこと
 * - **運用者どうしの代理ログインはできない**（権限の乗っ取りになるため）
 * - チケットは 5 分、セッションは 30 分で切れる。開きっぱなしにならないようにする
 * - お客様のデータがそのまま見える操作なので、いつ・誰が・誰に対して行ったかをログに残す
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { adminEmails, isAdminEmail } from "./config";
import { isUserId } from "./roles";

/** チケットの有効期限（秒）。押してから開くまでの時間だけあればよい */
export const TICKET_TTL_SECONDS = 5 * 60;

/** 代理ログインで作られるセッションの上限（秒）。切れたら自分でログインし直す */
export const SESSION_MAX_SECONDS = 30 * 60;

export interface CanImpersonateInput {
  /** 代理ログインしようとしている運用者の Clerk ユーザー ID */
  masterUserId: string;
  /** 見に行く相手の Clerk ユーザー ID */
  targetUserId: string;
  /** 相手の**確認済み**メールアドレス（未確認のものを渡さないこと） */
  targetVerifiedEmails: readonly string[];
  /** 運用者として設定されているメールアドレス（ADMIN_EMAILS） */
  admins: readonly string[];
}

export type CanImpersonate = { ok: true } | { ok: false; reason: string };

/**
 * その代理ログインを認めてよいか（純粋）。認められない理由は運用者にそのまま出す。
 *
 * 運用者どうしを弾くのは、片方の運用者がもう片方になりすませると、
 * 「誰がやったのか」がログからも追えなくなるため。
 */
export function canImpersonate(input: CanImpersonateInput): CanImpersonate {
  const { masterUserId, targetUserId, targetVerifiedEmails, admins } = input;
  if (!isUserId(masterUserId) || !isUserId(targetUserId)) {
    return { ok: false, reason: "ユーザー ID の形が正しくありません。" };
  }
  if (masterUserId === targetUserId) {
    return { ok: false, reason: "ご自身の画面は代理ログインせずに開けます。" };
  }
  if (targetVerifiedEmails.some((e) => isAdminEmail(e, admins))) {
    return { ok: false, reason: "運用者のアカウントには代理ログインできません。" };
  }
  return { ok: true };
}

/**
 * 代理ログインの URL を作る。requireAdmin() を通してから呼ぶこと。
 *
 * 返す URL は Clerk のチケットを受け取る入口。ブラウザをここへ送ると、
 * そのお客様としてログインした状態になり、アプリの `/start` へ着く。
 */
export async function createImpersonationUrl(
  targetUserId: string,
): Promise<{ url: string; email: string }> {
  const { userId: masterUserId } = await auth();
  if (!masterUserId) throw new Error("ログインが必要です。");

  const client = await clerkClient();
  const target = await client.users.getUser(targetUserId);
  const verified = target.emailAddresses
    .filter((e) => e.verification?.status === "verified")
    .map((e) => e.emailAddress);

  const allowed = canImpersonate({
    masterUserId,
    targetUserId,
    targetVerifiedEmails: verified,
    admins: adminEmails(),
  });
  if (!allowed.ok) throw new Error(allowed.reason);

  const ticket = await client.actorTokens.create({
    userId: targetUserId,
    actor: { sub: masterUserId },
    expiresInSeconds: TICKET_TTL_SECONDS,
    sessionMaxDurationInSeconds: SESSION_MAX_SECONDS,
  });

  if (!ticket.url) throw new Error("代理ログインの URL を取得できませんでした。");

  const email =
    target.emailAddresses.find((e) => e.id === target.primaryEmailAddressId)?.emailAddress ??
    target.emailAddresses[0]?.emailAddress ??
    targetUserId;

  // お客様のデータが見える操作なので、いつ・誰が・誰に対して行ったかを必ず残す
  console.info(
    `[impersonate] ${masterUserId} が ${targetUserId}（${email}）の画面を開きました`,
  );

  return { url: ticket.url, email };
}

/**
 * いま代理ログイン中か。
 *
 * Clerk のセッションに actor（代理でログインした運用者の ID）が入っているかで判定する。
 * 決済など「お客様の代わりに実行してはいけない操作」を塞ぐのに使う。
 */
export async function isImpersonating(): Promise<boolean> {
  const { actor } = await auth();
  return typeof actor?.sub === "string" && actor.sub.length > 0;
}

/** 代理中に塞ぐ操作の応答。画面側で理由が分かるよう code を付ける */
export function impersonationBlockedResponse(): Response {
  return Response.json(
    {
      error:
        "代理ログイン中はお支払いの操作ができません。画面の確認だけを行い、操作が必要な場合はお客様ご自身に行っていただいてください。",
      code: "impersonating",
    },
    { status: 403, headers: { "cache-control": "no-store" } },
  );
}
