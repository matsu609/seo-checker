/**
 * 運用者（管理者）の判定。純粋関数だけを置く。
 *
 * 環境変数 ADMIN_EMAILS に列挙したメールアドレスだけを管理者とする。
 * 既定は「誰も管理者でない」。未設定を全員許可に倒すと、マスター画面から
 * 全顧客の請求情報が見えてしまうため、ここは必ず閉じる方向に倒す。
 *
 * 判定はメールアドレスなので、Clerk 側で確認済みのアドレスだけを使うこと
 * （guard.ts が verified なものに絞る）。未確認のアドレスを許すと、
 * 誰かが管理者のメールで登録するだけで入れてしまう。
 */

/** 環境変数の値を正規化したメール一覧にする（区切りはカンマ・空白・改行） */
export function parseAdminEmails(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.includes("@")),
    ),
  ];
}

/** 設定されている管理者のメール一覧 */
export function adminEmails(): string[] {
  return parseAdminEmails(process.env.ADMIN_EMAILS);
}

/** そのメールが管理者か。空の一覧・空のメールは常に false */
export function isAdminEmail(email: string | null | undefined, allowed: readonly string[]): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  return allowed.includes(normalized);
}

/** 管理機能が使える設定になっているか（未設定ならマスター画面ごと隠す） */
export function isAdminConfigured(): boolean {
  return adminEmails().length > 0;
}
