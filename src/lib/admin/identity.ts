/**
 * Clerk のユーザーから「連絡先のメール」「表示名」「運用者かどうか」を読む。純粋関数だけを置く。
 *
 * 2026-09-23 まで、同じ読み方が 5 か所（admin/clients.ts・admin/agencies.ts・admin/impersonate.ts・
 * plans/user.ts・api/feedback）に書き写されていた。書き写しの 1 つ（顧客一覧から運用者を外す判定）だけが
 * **未確認のメールも運用者として数えていた**ので、ここに寄せて確認済みだけを見る形にそろえた。
 *
 * 型は Clerk の User を直接使わず、要る部分だけにしてある（テストで組み立てやすくするため）。
 */
import { adminEmails, isAdminEmail } from "./config";

export interface EmailLike {
  id?: string;
  emailAddress: string;
  /** Clerk の確認状態。確認済みは status = "verified" */
  verification?: { status?: string | null } | null;
}

export interface UserIdentityLike {
  primaryEmailAddressId?: string | null;
  emailAddresses: readonly EmailLike[];
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
}

/** 主メール（無ければ最初のメール）。1 つも無ければ null */
export function primaryEmail(user: Pick<UserIdentityLike, "primaryEmailAddressId" | "emailAddresses">): string | null {
  const primary = user.emailAddresses.find((e) => e.id !== undefined && e.id === user.primaryEmailAddressId);
  return primary?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
}

/** 「姓 名」→ ユーザー名 → 空文字 */
export function displayName(user: Pick<UserIdentityLike, "firstName" | "lastName" | "username">): string {
  const full = [user.lastName, user.firstName].filter(Boolean).join(" ").trim();
  return full || user.username || "";
}

/** 確認済みのメールだけ。未確認のアドレスは誰でも自分のアカウントに足せるので、権限の判定には使わない */
export function verifiedEmails(user: Pick<UserIdentityLike, "emailAddresses">): string[] {
  return user.emailAddresses.filter((e) => e.verification?.status === "verified").map((e) => e.emailAddress);
}

/**
 * 運用者（ADMIN_EMAILS）のアカウントか。**確認済みのメールだけ**を突き合わせる。
 * 未確認のメールを許すと、運用者のアドレスを自分のアカウントに足すだけで運用者になれてしまう。
 */
export function isOperatorUser(user: Pick<UserIdentityLike, "emailAddresses">, allowed: readonly string[] = adminEmails()): boolean {
  if (allowed.length === 0) return false;
  return verifiedEmails(user).some((email) => isAdminEmail(email, allowed));
}

/** そのメールアドレス（正規化済み）を確認済みで持っているか（大文字小文字・前後の空白は無視） */
export function hasVerifiedEmail(user: Pick<UserIdentityLike, "emailAddresses">, email: string): boolean {
  const target = email.trim().toLowerCase();
  if (!target) return false;
  return verifiedEmails(user).some((e) => e.trim().toLowerCase() === target);
}
