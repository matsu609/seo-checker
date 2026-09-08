/**
 * Clerk が設定されているかどうか。サーバー専用（キーの値は返さない）。
 *
 * このリポジトリの他の連携（src/lib/integrations.ts）と同じく、
 * 環境変数が無ければその機能を止める作りにしてある。認証の場合
 * 「未設定 = 素通り」になるので、本番で取り違えないよう
 * 起動時に一度だけ警告を出す。
 */

function has(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/** 公開キーと秘密キーが両方そろっているか */
export function isAuthEnabled(): boolean {
  return has("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") && has("CLERK_SECRET_KEY");
}

let warned = false;

/**
 * 認証が無効なまま動いていることを一度だけ知らせる。
 * 開発と E2E では正常な状態なので、本番相当のときだけ強い文言にする。
 */
export function warnIfAuthDisabled(): void {
  if (warned || isAuthEnabled()) return;
  warned = true;
  const production = process.env.NODE_ENV === "production";
  console.warn(
    production
      ? "[auth] Clerk のキーが未設定のため、ツール画面と API が誰でも使える状態です。" +
          " NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY と CLERK_SECRET_KEY を設定してください。"
      : "[auth] Clerk のキーが未設定のため認証は無効です（開発・E2E では正常）。",
  );
}
