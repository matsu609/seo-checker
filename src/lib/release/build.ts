/**
 * いま動いているビルドの情報。サーバー専用（画面に出すのは管理者向けだけ）。
 *
 * Vercel はシステム環境変数を実行時にも渡すので、ビルド時に埋め込まなくても読める。
 * ローカルや他の環境では未設定なので、その場合は null を返す。
 */

/** 短縮 SHA にそろえる（比較と表示のため） */
export function shortCommit(sha: string | undefined | null): string | null {
  if (typeof sha !== "string") return null;
  const trimmed = sha.trim().toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(trimmed)) return null;
  return trimmed.slice(0, 7);
}

export interface BuildInfo {
  /** デプロイされているコミット（短縮 SHA）。分からなければ null */
  commit: string | null;
  /** デプロイ元のブランチ。分からなければ null */
  branch: string | null;
  /** Vercel の環境（production / preview / development） */
  environment: string | null;
}

export function buildInfo(): BuildInfo {
  return {
    commit: shortCommit(process.env.VERCEL_GIT_COMMIT_SHA),
    branch: process.env.VERCEL_GIT_COMMIT_REF || null,
    environment: process.env.VERCEL_ENV || null,
  };
}
