/**
 * Google の認可画面から戻ってくる先。
 *
 * Clerk が接続を確定させてから、元の画面（既定は設定）へ送り返す。
 * 未ログイン扱いで弾かれると接続の途中で流れが切れるため、
 * このパスは公開扱いにしている（src/lib/auth/routes.ts）。
 */
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import type { Metadata } from "next";
import { isAuthEnabled } from "@/lib/auth/config";
import { AuthUnavailable } from "@/components/auth/AuthUnavailable";

export const metadata: Metadata = { title: "接続しています" };

export default function SsoCallbackPage() {
  if (!isAuthEnabled()) return <AuthUnavailable />;
  return (
    <div className="mx-auto max-w-xl py-12 text-center">
      <p className="text-sm text-muted">Google との接続を確認しています…</p>
      <AuthenticateWithRedirectCallback
        signInFallbackRedirectUrl="/settings"
        signUpFallbackRedirectUrl="/settings"
      />
    </div>
  );
}
