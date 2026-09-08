/**
 * アカウント登録画面。誰でも登録できてよいかは Clerk 側の
 * Restrictions（招待制・許可リスト）で決める。README を参照。
 */
import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { isAuthEnabled } from "@/lib/auth/config";
import { AuthUnavailable } from "@/components/auth/AuthUnavailable";

export const metadata: Metadata = { title: "アカウント登録" };

export default function SignUpPage() {
  if (!isAuthEnabled()) return <AuthUnavailable />;
  return (
    <div className="flex justify-center py-8">
      <SignUp signInUrl="/sign-in" fallbackRedirectUrl="/tools/site-audit" />
    </div>
  );
}
