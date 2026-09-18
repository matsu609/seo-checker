/**
 * アカウント登録。無料診断の前に 6 項目（担当者名・メール・会社名・電話・店舗の種類・パスワード）を
 * 集める自前のフォーム（利用者の決定 2026-09-18）。裏は Clerk（src/components/auth/RegisterForm.tsx）。
 *
 * キャッチオールなので /sign-up/profile（登録情報の補完。Google でログインした人向け）もここで受ける。
 * 誰でも登録できる前提（登録した人は無料診断 2 回まで。ツールはプランを付けるまで開かない。
 * 本番の DEFAULT_PLAN は free にしておくこと）。
 */
import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthUnavailable } from "@/components/auth/AuthUnavailable";
import { LeadProfileForm } from "@/components/auth/LeadProfileForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { isAuthEnabled } from "@/lib/auth/config";

export const metadata: Metadata = { title: "アカウント登録（無料）" };

export default async function SignUpPage({ params }: { params: Promise<{ "sign-up"?: string[] }> }) {
  if (!isAuthEnabled()) return <AuthUnavailable />;
  const segments = (await params)["sign-up"] ?? [];
  const profile = segments[0] === "profile";
  return (
    <div className="flex justify-center px-4 py-8">
      {profile ? (
        <Suspense fallback={null}>
          <LeadProfileForm />
        </Suspense>
      ) : (
        <RegisterForm />
      )}
    </div>
  );
}
