/**
 * 無料診断の専用ログイン（利用者の決定 2026-10-02）。
 *
 * 無料診断（`/` と `/meo`）はお客様のアカウントでは使わない。営業・デモで使う人に、このページの URL と
 * 1 組の ID / パスワード（環境変数 FREE_DIAGNOSIS_ID / FREE_DIAGNOSIS_PASSWORD）を渡す。
 * ログインできたら署名付き Cookie（30 日）を置いて無料診断へ送る。すでに入れる状態なら無料診断へ。
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FreeLoginForm } from "@/components/free/FreeLoginForm";
import { FREE_PATHS } from "@/lib/free/upsell";
import { hasFreeAccess, isFreeLoginConfigured } from "@/lib/free/access";

export const metadata: Metadata = { title: "無料診断ログイン" };
export const dynamic = "force-dynamic";

export default async function FreeLoginPage() {
  if (await hasFreeAccess()) redirect(FREE_PATHS.site);
  return (
    <div className="flex justify-center px-4 py-8">
      <Suspense fallback={null}>
        <FreeLoginForm configured={isFreeLoginConfigured()} />
      </Suspense>
    </div>
  );
}
