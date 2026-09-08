/**
 * ログイン画面。Clerk のキャッチオールルートなので、
 * /sign-in の下の各ステップ（2 要素認証など）も同じページが受ける。
 */
import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";
import { isAuthEnabled } from "@/lib/auth/config";
import { AuthUnavailable } from "@/components/auth/AuthUnavailable";

export const metadata: Metadata = { title: "ログイン" };

export default function SignInPage() {
  if (!isAuthEnabled()) return <AuthUnavailable />;
  return (
    <div className="flex justify-center py-8">
      <SignIn signUpUrl="/sign-up" fallbackRedirectUrl="/tools/site-audit" />
    </div>
  );
}
